import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
} from "mediabunny";
import { Container, Graphics, Rectangle, Sprite, Texture, VideoSource } from "pixi.js";

export async function createMediabunnyVideoFrameProvider(source, options = {}) {
  const { width, height, fit = "contain", poolSize = 3 } = options;

  if (!(source instanceof Blob)) {
    throw new TypeError("source must be a Blob or File.");
  }

  const input = new Input({
    source: new BlobSource(source),
    formats: ALL_FORMATS,
  });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();

    if (!videoTrack) {
      throw new Error("No video track found.");
    }

    const displayWidth = width || (await videoTrack.getDisplayWidth());
    const displayHeight = height || (await videoTrack.getDisplayHeight());
    const duration =
      (await input.getDurationFromMetadata([videoTrack])) ??
      (await input.computeDuration([videoTrack]));
    const sink = new CanvasSink(videoTrack, {
      width: displayWidth,
      height: displayHeight,
      fit,
      poolSize,
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });

    if (!context) {
      throw new Error("Cannot create frame canvas context.");
    }

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    let disposed = false;

    return {
      canvas,
      duration,
      height: displayHeight,
      width: displayWidth,
      async drawFrameAt(time) {
        if (disposed) {
          return null;
        }

        const safeTime = clampTime(time, duration);
        const frame = await sink.getCanvas(safeTime);

        if (!frame || disposed) {
          return null;
        }

        context.clearRect(0, 0, displayWidth, displayHeight);
        context.drawImage(frame.canvas, 0, 0, displayWidth, displayHeight);

        return {
          canvas,
          duration: frame.duration,
          height: displayHeight,
          time: frame.timestamp,
          width: displayWidth,
        };
      },
      dispose() {
        disposed = true;
        input.dispose();
      },
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

export async function extractVideoFramesWithMediabunny(source, options = {}) {
  const {
    intervalSeconds = 1,
    thumbnailWidth = 160,
    thumbnailHeight,
    maxFrames = 160,
    includeLastFrame = false,
    fit = "contain",
    poolSize = 3,
    startTime = 0,
    duration,
  } = options;

  if (intervalSeconds <= 0) {
    throw new Error("intervalSeconds must be greater than 0.");
  }

  const provider = await createMediabunnyVideoFrameProvider(source, {
    width: thumbnailWidth,
    height: thumbnailHeight,
    fit,
    poolSize,
  });

  try {
    const safeStartTime = Math.min(
      Math.max(Number.isFinite(startTime) ? startTime : 0, 0),
      Math.max(0, provider.duration - 0.001)
    );
    const safeDuration = Number.isFinite(duration)
      ? Math.max(0, Math.min(duration, provider.duration - safeStartTime))
      : Math.max(0, provider.duration - safeStartTime);
    const times = createFrameTimes(safeDuration, intervalSeconds, maxFrames, includeLastFrame).map(
      (time) => safeStartTime + time
    );
    const frames = [];

    for (const time of times) {
      const frame = await provider.drawFrameAt(time);

      if (frame) {
        frames.push(cloneCanvasFrame(frame));
      }
    }

    return frames;
  } finally {
    provider.dispose();
  }
}

export async function exportVideoWithTextOverlay(source, overlay = {}, options = {}) {
  const { onProgress, poolSize = 4 } = options;

  if (!(source instanceof Blob)) {
    throw new TypeError("source must be a Blob or File.");
  }

  const input = new Input({
    source: new BlobSource(source),
    formats: ALL_FORMATS,
  });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();

    if (!videoTrack) {
      throw new Error("No video track found.");
    }

    const width = await videoTrack.getDisplayWidth();
    const height = await videoTrack.getDisplayHeight();
    const duration =
      (await input.getDurationFromMetadata([videoTrack])) ??
      (await input.computeDuration([videoTrack]));
    const outputCanvas = document.createElement("canvas");
    const outputContext = outputCanvas.getContext("2d", { alpha: false });

    if (!outputContext) {
      throw new Error("Cannot create export canvas context.");
    }

    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputFormat = new Mp4OutputFormat();
    const codec = await getFirstEncodableVideoCodec(outputFormat.getSupportedCodecs(), {
      bitrate: QUALITY_HIGH,
      height,
      width,
    });

    if (!codec) {
      throw new Error("Browser cannot encode MP4 video on this device.");
    }

    const target = new BufferTarget();
    const output = new Output({
      format: outputFormat,
      target,
    });
    const videoSource = new CanvasSource(outputCanvas, {
      bitrate: QUALITY_HIGH,
      codec,
      keyFrameInterval: 2,
    });
    const sink = new CanvasSink(videoTrack, {
      fit: "contain",
      height,
      poolSize,
      width,
    });
    const audioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const audioSource =
      audioTrack && audioCodec && outputFormat.getSupportedCodecs().includes(audioCodec)
        ? new EncodedAudioPacketSource(audioCodec)
        : null;

    output.addVideoTrack(videoSource);
    if (audioSource) {
      output.addAudioTrack(audioSource);
    }

    await output.start();

    let audioCopyError = null;
    const audioCopyPromise =
      audioTrack && audioSource
        ? copyAudioPackets(audioTrack, audioSource, duration).catch((error) => {
            audioCopyError = error;
          })
        : Promise.resolve();

    for await (const frame of sink.canvases(0, duration)) {
      outputContext.clearRect(0, 0, width, height);
      outputContext.drawImage(frame.canvas, 0, 0, width, height);
      drawImageOverlay(outputContext, width, height, frame.timestamp, overlay.image);
      drawTextOverlay(outputContext, width, height, frame.timestamp, overlay);
      await videoSource.add(Math.max(0, frame.timestamp), frame.duration);

      if (typeof onProgress === "function") {
        onProgress(Math.min(1, (frame.timestamp + frame.duration) / duration));
      }
    }

    videoSource.close();
    await audioCopyPromise;
    if (audioCopyError) {
      throw audioCopyError;
    }
    await output.finalize();

    if (!target.buffer) {
      throw new Error("Mediabunny did not produce an output buffer.");
    }

    return new Blob([target.buffer], { type: await output.getMimeType() });
  } finally {
    input.dispose();
  }
}

export async function exportTimelineComposition(videoClips, overlay = {}, options = {}) {
  const { audioBuffer = null, duration, fps = 30, onProgress, poolSize = 4 } = options;

  if (!Array.isArray(videoClips) || videoClips.length === 0) {
    throw new Error("No video clips to export.");
  }

  const safeDuration = Number.isFinite(duration)
    ? Math.max(0, duration)
    : Math.max(...videoClips.map((clip) => clip.startTime + clip.duration));
  const providers = [];

  try {
    for (const clip of videoClips) {
      providers.push({
        ...clip,
        provider: await createMediabunnyVideoFrameProvider(clip.file, { fit: "contain", poolSize }),
      });
    }

    const baseProvider = providers[0].provider;
    const width = baseProvider.width;
    const height = baseProvider.height;
    const outputCanvas = document.createElement("canvas");
    const outputContext = outputCanvas.getContext("2d", { alpha: false });

    if (!outputContext) {
      throw new Error("Cannot create export canvas context.");
    }

    outputCanvas.width = width;
    outputCanvas.height = height;

    const outputFormat = new Mp4OutputFormat();
    const videoCodec = await getFirstEncodableVideoCodec(outputFormat.getSupportedCodecs(), {
      bitrate: QUALITY_HIGH,
      height,
      width,
    });

    if (!videoCodec) {
      throw new Error("Browser cannot encode MP4 video on this device.");
    }

    const target = new BufferTarget();
    const output = new Output({
      format: outputFormat,
      target,
    });
    const videoSource = new CanvasSource(outputCanvas, {
      bitrate: QUALITY_HIGH,
      codec: videoCodec,
      keyFrameInterval: 2,
    });
    const audioCodec =
      audioBuffer &&
      (await getFirstEncodableAudioCodec(outputFormat.getSupportedAudioCodecs(), {
        bitrate: QUALITY_HIGH,
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
      }));
    const audioSource = audioCodec
      ? new AudioBufferSource({
          bitrate: QUALITY_HIGH,
          codec: audioCodec,
          numberOfChannels: audioBuffer.numberOfChannels,
          sampleRate: audioBuffer.sampleRate,
        })
      : null;

    output.addVideoTrack(videoSource);
    if (audioSource) {
      output.addAudioTrack(audioSource);
    }

    await output.start();

    const audioPromise = audioSource ? audioSource.add(audioBuffer) : Promise.resolve();
    const frameDuration = 1 / Math.max(1, fps);
    const frameCount = Math.max(1, Math.ceil(safeDuration / frameDuration));

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const timestamp = Math.min(frameIndex * frameDuration, Math.max(0, safeDuration - 0.001));
      const activeClip = providers.find(
        (clip) => timestamp >= clip.startTime && timestamp < clip.startTime + clip.duration
      );

      outputContext.fillStyle = "#000000";
      outputContext.fillRect(0, 0, width, height);

      if (activeClip) {
        const sourceOffset = Math.max(
          0,
          Number.isFinite(activeClip.sourceOffset) ? activeClip.sourceOffset : 0
        );
        const frame = await activeClip.provider.drawFrameAt(
          sourceOffset + timestamp - activeClip.startTime
        );

        if (frame) {
          drawContainedFrame(outputContext, frame.canvas, width, height);
        }
      }

      drawImageOverlays(outputContext, width, height, timestamp, overlay.images);
      drawImageOverlay(outputContext, width, height, timestamp, overlay.image);
      drawTextOverlay(outputContext, width, height, timestamp, overlay);
      await videoSource.add(timestamp, Math.min(frameDuration, safeDuration - timestamp));

      if (typeof onProgress === "function") {
        onProgress(Math.min(1, (timestamp + frameDuration) / safeDuration));
      }
    }

    videoSource.close();
    await audioPromise;
    await output.finalize();

    if (!target.buffer) {
      throw new Error("Mediabunny did not produce an output buffer.");
    }

    return new Blob([target.buffer], { type: await output.getMimeType() });
  } finally {
    providers.forEach((clip) => clip.provider.dispose());
  }
}

export async function extractVideoFramesWithPixi(renderer, source, options = {}) {
  const {
    intervalSeconds = 1,
    thumbnailWidth = 160,
    thumbnailHeight,
    maxFrames = 160,
    includeLastFrame = false,
    resolution = 1,
    clearColor = 0x000000,
    crossOrigin = false,
  } = options;

  if (!renderer?.extract?.canvas) {
    throw new Error("A Pixi renderer with the extract system is required.");
  }

  if (intervalSeconds <= 0) {
    throw new Error("intervalSeconds must be greater than 0.");
  }

  const objectUrl = source instanceof Blob ? URL.createObjectURL(source) : "";
  const video = document.createElement("video");
  const frames = [];
  let videoTexture = null;
  let frameScene = null;
  let frameSprite = null;

  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  if (crossOrigin) {
    video.crossOrigin = crossOrigin === true ? "anonymous" : crossOrigin;
  }

  video.src = objectUrl || source;

  try {
    await waitForMediaEvent(video, "loadedmetadata", "video");
    await waitForMediaEvent(video, "loadeddata", "video", video.HAVE_CURRENT_DATA);

    if (!video.videoWidth || !video.videoHeight || !Number.isFinite(video.duration)) {
      throw new Error("Browser cannot decode video frames from this file.");
    }

    const aspectRatio = video.videoWidth / video.videoHeight;
    const outputWidth = Math.max(1, Math.round(thumbnailWidth));
    const outputHeight = Math.max(1, Math.round(thumbnailHeight || outputWidth / aspectRatio));
    const videoSource = new VideoSource({
      resource: video,
      width: video.videoWidth,
      height: video.videoHeight,
      autoLoad: false,
      autoPlay: false,
      crossorigin: Boolean(crossOrigin),
      preload: true,
      updateFPS: 0,
    });

    videoTexture = new Texture({ source: videoSource });
    await videoSource.load();
    videoSource.resize(video.videoWidth, video.videoHeight);

    frameScene = new Container();
    frameSprite = new Sprite({ texture: videoTexture });
    frameScene.addChild(new Graphics().rect(0, 0, outputWidth, outputHeight).fill(clearColor));
    frameScene.addChild(frameSprite);

    fitFrameSprite(frameSprite, video.videoWidth, video.videoHeight, outputWidth, outputHeight);

    const times = createFrameTimes(video.duration, intervalSeconds, maxFrames, includeLastFrame);

    for (const time of times) {
      await seekVideoFrame(video, time);
      videoSource.updateFrame();
      videoTexture.update();

      const canvas = renderer.extract.canvas({
        target: frameScene,
        frame: new Rectangle(0, 0, outputWidth, outputHeight),
        resolution,
        clearColor,
      });

      frames.push({
        canvas,
        height: outputHeight,
        time,
        width: outputWidth,
      });
    }

    return frames;
  } finally {
    if (frameScene) {
      frameScene.destroy({ children: true });
    }

    if (videoTexture && !videoTexture.destroyed) {
      videoTexture.destroy(true);
    }

    video.pause();
    video.removeAttribute("src");
    video.load();

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

async function copyAudioPackets(audioTrack, audioSource, duration) {
  const sink = new EncodedPacketSink(audioTrack);
  const decoderConfig = await audioTrack.getDecoderConfig();
  const meta = { decoderConfig: decoderConfig ?? undefined };

  for await (const packet of sink.packets()) {
    if (packet.timestamp >= duration) {
      break;
    }

    if (packet.timestamp < 0) {
      continue;
    }

    await audioSource.add(packet, meta);
  }

  audioSource.close();
}

function drawTextOverlay(context, width, height, time, overlay) {
  const {
    duration = 5,
    fillStyle = "#ffffff",
    fontFamily = "Inter, system-ui, sans-serif",
    fontStyle = "normal",
    fontSizeRatio = 0.085,
    fontWeight = "800",
    intervals,
    startTime = 0,
    strokeStyle = "rgba(0, 0, 0, 0.82)",
    text = "",
    transitionSeconds = 0,
    xRatio = 0.5,
    yRatio = 0.5,
  } = overlay;
  const transition = getOverlayTransitionAtTime(time, {
    duration,
    intervals,
    startTime,
    transitionSeconds,
  });

  if (!text || transition.alpha <= 0) {
    return;
  }

  const fontSize = Math.max(10, Math.round(height * fontSizeRatio));
  const x = Math.min(Math.max(xRatio, 0), 1) * width;
  const y = Math.min(Math.max(yRatio, 0), 1) * height;

  context.save();
  context.globalAlpha = transition.alpha;
  context.translate(x, y);
  context.scale(transition.yScale, 1);
  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, Math.round(fontSize * 0.16));
  context.strokeStyle = strokeStyle;
  context.fillStyle = fillStyle;
  context.strokeText(text, 0, 0);
  context.fillText(text, 0, 0);
  context.restore();
}

function drawImageOverlay(context, width, height, time, overlay) {
  if (!overlay?.imageSource) {
    return;
  }

  const {
    duration = Number.POSITIVE_INFINITY,
    heightRatio = 0.5,
    imageSource,
    startTime = 0,
    transitionSeconds = 0,
    widthRatio = 0.5,
    xRatio = 0.25,
    yRatio = 0.25,
  } = overlay;
  const transition = getOverlayTransitionAtTime(time, { duration, startTime, transitionSeconds });

  if (transition.alpha <= 0) {
    return;
  }

  const targetWidth = Math.max(1, width * Math.min(Math.max(widthRatio, 0), 1));
  const targetHeight = Math.max(1, height * Math.min(Math.max(heightRatio, 0), 1));
  const x = Math.min(Math.max(width * xRatio, 0), width - targetWidth);
  const y = Math.min(Math.max(height * yRatio, 0), height - targetHeight);

  context.save();
  context.globalAlpha = transition.alpha;
  context.translate(x + targetWidth / 2, y + targetHeight / 2);
  context.scale(transition.yScale, 1);
  context.drawImage(imageSource, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
  context.restore();
}

function drawImageOverlays(context, width, height, time, overlays) {
  if (!Array.isArray(overlays)) {
    return;
  }

  for (const overlay of overlays) {
    drawImageOverlay(context, width, height, time, overlay);
  }
}

function drawContainedFrame(context, sourceCanvas, width, height) {
  const scale = Math.min(width / sourceCanvas.width, height / sourceCanvas.height);
  const targetWidth = sourceCanvas.width * scale;
  const targetHeight = sourceCanvas.height * scale;
  const x = (width - targetWidth) / 2;
  const y = (height - targetHeight) / 2;

  context.drawImage(sourceCanvas, x, y, targetWidth, targetHeight);
}

function getOverlayTransitionAtTime(time, overlay) {
  const intervals = Array.isArray(overlay.intervals)
    ? overlay.intervals
    : [{ duration: overlay.duration, startTime: overlay.startTime }];
  let progress = 0;

  for (const interval of intervals) {
    const start = interval.startTime;
    const end = interval.startTime + interval.duration;

    if (time < start || time >= end) {
      continue;
    }

    const transitionSeconds = overlay.transitionSeconds || 0;
    const fadeIn = transitionSeconds > 0 ? Math.min((time - start) / transitionSeconds, 1) : 1;
    const fadeOut = transitionSeconds > 0 ? Math.min((end - time) / transitionSeconds, 1) : 1;

    progress = Math.max(progress, easeInOut(Math.min(fadeIn, fadeOut)));
  }

  return {
    alpha: progress,
    yScale: Math.cos((1 - progress) * (Math.PI / 2)),
  };
}

function easeInOut(value) {
  return value * value * (3 - 2 * value);
}

function cloneCanvasFrame(frame) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Cannot clone frame canvas.");
  }

  canvas.width = frame.width;
  canvas.height = frame.height;
  context.drawImage(frame.canvas, 0, 0, frame.width, frame.height);

  return {
    canvas,
    duration: frame.duration,
    height: frame.height,
    time: frame.time,
    width: frame.width,
  };
}

function clampTime(time, duration) {
  const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const maxTime = Math.max(0, safeDuration - 0.001);

  return Math.min(Math.max(time, 0), maxTime);
}

function fitFrameSprite(sprite, sourceWidth, sourceHeight, outputWidth, outputHeight) {
  const scale = Math.min(outputWidth / sourceWidth, outputHeight / sourceHeight);

  sprite.scale.set(scale);
  sprite.position.set(
    (outputWidth - sourceWidth * scale) / 2,
    (outputHeight - sourceHeight * scale) / 2
  );
}

function createFrameTimes(duration, intervalSeconds, maxFrames, includeLastFrame) {
  const safeDuration = Math.max(0, duration);
  const endTime = Math.max(0, safeDuration - 0.001);
  const times = [];

  for (let time = 0; time < safeDuration && times.length < maxFrames; time += intervalSeconds) {
    times.push(Math.min(time, endTime));
  }

  if (
    includeLastFrame &&
    times.length < maxFrames &&
    endTime > 0 &&
    Math.abs(times[times.length - 1] - endTime) > 0.05
  ) {
    times.push(endTime);
  }

  return times;
}

function waitForMediaEvent(element, eventName, label, targetReadyState = 0) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      element.removeEventListener(eventName, handleReady);
      element.removeEventListener("error", handleError);
    };
    const handleReady = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`Browser cannot play this ${label} file.`));
    };

    if (targetReadyState > 0 && element.readyState >= targetReadyState) {
      resolve();
      return;
    }

    element.addEventListener(eventName, handleReady, { once: true });
    element.addEventListener("error", handleError, { once: true });
    element.load();
  });
}

function seekVideoFrame(video, time) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    const finish = () => {
      cleanup();
      waitForDecodedFrame(video).then(resolve, reject);
    };
    const handleSeeked = () => {
      finish();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Browser failed while seeking video."));
    };
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while seeking video."));
    }, 5000);

    video.pause();

    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= video.HAVE_CURRENT_DATA) {
      finish();
      return;
    }

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = time;
  });
}

function waitForDecodedFrame(video) {
  if (typeof video.requestVideoFrameCallback === "function") {
    return new Promise((resolve) => {
      let resolved = false;
      const timeoutId = window.setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 250);

      video.requestVideoFrameCallback(() => {
        if (!resolved) {
          resolved = true;
          window.clearTimeout(timeoutId);
          resolve();
        }
      });
    });
  }

  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
