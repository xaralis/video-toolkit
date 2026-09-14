"""
Modal deployment for ACE-Step 1.5 music generation.

Deploy:
    modal deploy docker/modal-music-gen/app.py

Capabilities: text-to-music, vocal music with lyrics, cover/style transfer, stem extraction.

Note: Uses L40S (48GB VRAM). Cold start ~3min (≈30GB of weights are baked in).
"""

import modal

app = modal.App("video-toolkit-music-gen")

# Build image with ACE-Step repo and baked model weights (~10GB)
image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-cudnn-devel-ubuntu22.04", add_python="3.11")
    .apt_install("git", "git-lfs", "ffmpeg", "libsndfile1")
    .run_commands("git lfs install")
    .pip_install(
        "torch==2.5.1",
        "torchaudio==2.5.1",
        "torchvision==0.20.1",
        "transformers>=4.51.0,<4.58.0",
        "diffusers",
        "accelerate>=1.12.0",
        "safetensors>=0.7.0",
        "soundfile>=0.13.1",
        "einops>=0.8.1",
        "scipy>=1.10.1",
        "vector-quantize-pytorch>=1.27.15",
        "numba>=0.63.1",
        "toml",
        "loguru>=0.7.3",
        "peft>=0.18.0",
        "boto3",
        "requests",
        "fastapi[standard]",
        "huggingface_hub>=0.25.0",
    )
    # Clone ACE-Step repo and install
    .run_commands(
        "git clone --depth 1 https://github.com/ACE-Step/ACE-Step-1.5.git /app/acestep-repo",
        "cd /app/acestep-repo/acestep/third_parts/nano-vllm && pip install --no-deps -e .",
        "cd /app/acestep-repo && pip install --no-deps -e .",
    )
    # Bake model weights into image.
    #
    # XL, not the base turbo. The base checkpoint is what this endpoint shipped
    # with and it is audibly weaker than what acemusic.ai serves — which runs
    # acestep-v1.5-xl-turbo. Same family, four times the parameters.
    #
    # Downloaded straight into <project_root>/checkpoints/<name>/, because that
    # is where the handler's catalogue looks: it lists directories under the
    # checkpoints dir whose names start with "acestep-v15-". Warming the HF
    # cache instead (what this file used to do) leaves the resolution up to
    # their downloader at container start.
    .run_commands(
        'python -c "'
        "from huggingface_hub import snapshot_download; "
        "snapshot_download('ACE-Step/acestep-v15-xl-turbo', "
        "local_dir='/app/acestep-repo/checkpoints/acestep-v15-xl-turbo')"
        '"'
    )
    # The 5Hz LM is what 'thinking' mode actually runs. 4B is the big one; the
    # 1.7B this image used to carry was never loaded at all (see load_models).
    .run_commands(
        'python -c "'
        "from huggingface_hub import snapshot_download; "
        "snapshot_download('ACE-Step/acestep-5Hz-lm-4B', "
        "local_dir='/app/acestep-repo/checkpoints/acestep-5Hz-lm-4B')"
        '"'
    )
    .run_commands(
        'python -c "'
        "from huggingface_hub import snapshot_download; "
        "snapshot_download('ACE-Step/Ace-Step1.5', "
        "allow_patterns=['vae/*', 'Qwen3-Embedding-0.6B/*', 'config.json'], "
        "local_dir='/app/acestep-repo/checkpoints')"
        '"'
    )
    .env({
        "ACESTEP_CONFIG_PATH": "acestep-v15-xl-turbo",
        "ACESTEP_DEVICE": "cuda",
        "ACESTEP_LM_MODEL_PATH": "acestep-5Hz-lm-4B",
        "ACESTEP_INIT_LLM": "true",
    })
)


@app.cls(
    image=image,
    # L40S (48 GB): the XL DiT and the 4B LM are ~18 GB of weights between
    # them before activations — an A10G's 24 GB does not carry both.
    gpu="L40S",
    timeout=900,
    scaledown_window=120,
)
@modal.concurrent(max_inputs=1)
class MusicGen:
    @modal.enter()
    def load_models(self):
        """Load ACE-Step DiT model on container start."""
        import os
        import time
        import torch

        print(f"PyTorch {torch.__version__}, CUDA: {torch.cuda.is_available()}")
        if torch.cuda.is_available():
            print(f"GPU: {torch.cuda.get_device_name(0)}")

        t0 = time.time()
        from acestep.handler import AceStepHandler

        self.dit_handler = AceStepHandler()
        self.dit_handler.initialize_service(
            project_root="/app/acestep-repo",
            config_path=os.environ.get("ACESTEP_CONFIG_PATH", "acestep-v15-xl-turbo"),
            device=os.environ.get("ACESTEP_DEVICE", "cuda"),
        )
        print(f"DiT model loaded in {time.time() - t0:.1f}s")

        # The 5Hz LM — this is what 'thinking' mode runs on, and it was the
        # endpoint's real gap: generate() passed llm_handler=None, so the LM
        # was never consulted no matter what the caller asked for. music_gen.py
        # has been sending {"thinking": true} to this endpoint all along and it
        # went straight into the bin, which is a large part of why Modal output
        # sat below acemusic's on the same prompt.
        #
        # A failure here is NOT fatal: generation still works without the LM,
        # just without chain-of-thought. Better a plainer track than a dead
        # endpoint.
        self.llm_handler = None
        t1 = time.time()
        try:
            from acestep.llm_inference import LLMHandler

            handler = LLMHandler()
            status, ok = handler.initialize(
                checkpoint_dir="/app/acestep-repo/checkpoints",
                lm_model_path=os.environ.get("ACESTEP_LM_MODEL_PATH", "acestep-5Hz-lm-4B"),
                backend=os.environ.get("ACESTEP_LM_BACKEND", "pt"),
                device=os.environ.get("ACESTEP_DEVICE", "cuda"),
                offload_to_cpu=False,
                dtype=None,
            )
            if ok and handler.llm_initialized:
                self.llm_handler = handler
                print(f"5Hz LM loaded in {time.time() - t1:.1f}s: {status}")
            else:
                print(f"5Hz LM NOT loaded ({status}) — thinking mode unavailable")
        except Exception as exc:
            print(f"5Hz LM failed to load: {exc} — thinking mode unavailable")

    @modal.fastapi_endpoint(method="POST")
    def generate(self, request: dict) -> dict:
        import base64
        import os
        import random
        import tempfile
        import time
        import uuid
        from pathlib import Path

        from acestep.inference import GenerationParams, GenerationConfig, generate_music

        task_type = request.get("task_type", "text2music")
        prompt = request.get("prompt", "")
        lyrics = request.get("lyrics", "")
        duration = float(request.get("audio_duration", 30))
        steps = int(request.get("inference_steps", 8))
        audio_format = request.get("audio_format", "mp3")
        seed = request.get("seed")
        r2_config = request.get("r2")

        if seed is None:
            seed = random.randint(0, 2**32 - 1)

        start_time = time.time()
        temp_files = []

        try:
            # `thinking` arrives from music_gen.py on every request and used to
            # be dropped on the floor here. Defaults to True to match the
            # library's own default and acemusic's behaviour; it only takes
            # effect when the LM actually loaded.
            thinking = bool(request.get("thinking", True))

            params = GenerationParams(
                task_type=task_type,
                caption=prompt,
                lyrics=lyrics,
                duration=duration,
                inference_steps=steps,
                seed=seed,
                vocal_language=request.get("vocal_language", "unknown"),
                thinking=thinking and self.llm_handler is not None,
            )

            if request.get("bpm"):
                params.bpm = int(request["bpm"])
            if request.get("key_scale"):
                params.keyscale = request["key_scale"]
            if request.get("time_signature"):
                params.timesignature = str(request["time_signature"])

            # Task-specific params
            if task_type == "cover":
                ref_audio = request.get("reference_audio_base64")
                if not ref_audio:
                    return {"error": "reference_audio_base64 required for cover task"}
                ref_path = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
                with open(ref_path, "wb") as f:
                    f.write(base64.b64decode(ref_audio))
                temp_files.append(ref_path)
                params.reference_audio = ref_path
                params.audio_cover_strength = float(request.get("audio_cover_strength", 0.7))

            elif task_type == "extract":
                src_audio = request.get("src_audio_base64")
                if not src_audio:
                    return {"error": "src_audio_base64 required for extract task"}
                src_path = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False).name
                with open(src_path, "wb") as f:
                    f.write(base64.b64decode(src_audio))
                temp_files.append(src_path)
                params.src_audio = src_path

            config = GenerationConfig(
                batch_size=1,
                audio_format=audio_format,
                seeds=[seed],
                use_random_seed=False,
            )

            save_dir = tempfile.mkdtemp(prefix="acestep_")

            print(f"Generating: {task_type}, {duration}s, {steps} steps, seed={seed}, "
                  f"thinking={params.thinking}")
            result = generate_music(
                dit_handler=self.dit_handler,
                llm_handler=self.llm_handler,
                params=params,
                config=config,
                save_dir=save_dir,
            )

            inference_time_ms = int((time.time() - start_time) * 1000)

            if not result or not result.success or not result.audios:
                error_msg = result.error if result and result.error else "No audio generated"
                return {"error": str(error_msg)}

            audio_entry = result.audios[0]
            output_path = audio_entry.get("path", "")
            audio_params = audio_entry.get("params", {})
            metas = {
                "bpm": audio_params.get("bpm"),
                "keyscale": audio_params.get("keyscale", audio_params.get("key_scale")),
                "duration": audio_params.get("duration"),
                "timesignature": audio_params.get("timesignature"),
            }
            seed_value = audio_params.get("seed", seed)

            if not output_path or not Path(output_path).exists():
                return {"error": "No output audio file produced"}

            # Get actual duration
            actual_duration = None
            try:
                import torchaudio
                info = torchaudio.info(output_path)
                actual_duration = round(info.num_frames / info.sample_rate, 2)
            except Exception:
                pass

            response = {
                "success": True,
                "seed_value": seed_value,
                "metas": metas,
                "inference_time_ms": inference_time_ms,
            }
            if actual_duration:
                response["actual_duration_seconds"] = actual_duration

            # Upload to R2 or return base64
            if r2_config:
                try:
                    import boto3
                    from botocore.config import Config

                    s3 = boto3.client(
                        "s3",
                        endpoint_url=r2_config["endpoint_url"],
                        aws_access_key_id=r2_config["access_key_id"],
                        aws_secret_access_key=r2_config["secret_access_key"],
                        config=Config(signature_version="s3v4"),
                    )
                    object_key = f"acestep/results/{uuid.uuid4().hex[:12]}.{audio_format}"
                    s3.upload_file(output_path, r2_config["bucket_name"], object_key)
                    response["output_url"] = s3.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": r2_config["bucket_name"], "Key": object_key},
                        ExpiresIn=7200,
                    )
                    response["r2_key"] = object_key
                except Exception as e:
                    print(f"R2 upload failed, falling back to base64: {e}")
                    with open(output_path, "rb") as f:
                        response["audio_base64"] = base64.b64encode(f.read()).decode("utf-8")
            else:
                with open(output_path, "rb") as f:
                    response["audio_base64"] = base64.b64encode(f.read()).decode("utf-8")

            print(f"Done: {inference_time_ms}ms, {actual_duration}s audio")
            return response

        except Exception as e:
            import traceback
            print(f"Error: {e}")
            print(traceback.format_exc())
            return {"error": f"Internal error: {str(e)}"}
        finally:
            for f in temp_files:
                try:
                    os.unlink(f)
                except OSError:
                    pass
