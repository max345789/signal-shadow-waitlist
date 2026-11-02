# Kaggle Dual-GPU 30-Second Video Engine

This directory contains the production video generation model script and Kaggle kernel configuration for the **DabCloud Movie Workflow Studio**.

- **Kaggle Kernel**: [`sara8877/dabcloudbp-dual-gpu-30s-video-engine`](https://www.kaggle.com/code/sara8877/dabcloudbp-dual-gpu-30s-video-engine)
- **Primary Script**: `dabcloudbp-dual-gpu-30s-video-engine.py`

## Architecture

1. **Hardware Allocation**:
   - Primary GPU (`cuda:0`): Text-to-Image master keyframe synthesis (SDXL Turbo).
   - Secondary GPU (`cuda:1`): Stable Video Diffusion XT (`SVD-XT`) temporal diffusion pipeline with VAE tiling.
   - Dual Tesla T4 configuration provides ~30 GB VRAM.
   - Graceful fallback for single-GPU or CPU testing.

2. **30-Second Autoregressive Video Generation**:
   - Chained across 6 temporal segments (5 seconds each) for smooth continuity.
   - 24 FPS with Lanczos-4 upscaling to 1K/2K resolution (1920x1080).
   - Video encoding with H.264 (`libx264` with `yuv420p` pixel format) for instant cross-browser playback.

3. **Two-Way Studio Bridge**:
   - Cloudflare Quick Tunnel exposes the secure WebSocket endpoint (`wss://.../ws`).
   - Bidirectional protocol:
     - `HANDSHAKE`: Telemetry and GPU state.
     - `EXECUTE_GRAPH`: Receives task code, prompts, character designs, and environment specifications.
     - `LOG`: Emits live progress and segment rendering updates.
     - `UPDATE_NODE`: Progressively marks canvas nodes as running/done and attaches video URLs.
     - `VIDEO_READY` & `JOB_FINISHED`: Dispatches playable MP4 output directly to the studio canvas and output dialog.

## Deploying to Kaggle

```bash
kaggle kernels push -p kaggle/
```
