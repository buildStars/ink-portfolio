import MP4Box from 'mp4box';

/**
 * 开发用：检查录好的 MP4——用 mp4box 拆出视频帧数据、WebCodecs 逐帧解码，
 * 在指定时间点取帧拼成一张图。不依赖 <video> 播放器（预览窗口不出帧时播放器取不到画面）。
 */

interface Sample {
  data: Uint8Array;
  cts: number;
  duration: number;
  timescale: number;
  is_sync: boolean;
}

function demux(buf: ArrayBuffer) {
  return new Promise<{ config: VideoDecoderConfig; samples: Sample[] }>((resolve, reject) => {
    const file = MP4Box.createFile();
    const samples: Sample[] = [];
    let config: VideoDecoderConfig | null = null;
    file.onError = reject;
    file.onReady = (info: { videoTracks: { id: number; codec: string; video: { width: number; height: number }; nb_samples: number }[] }) => {
      const track = info.videoTracks[0];
      const trak = file.getTrackById(track.id);
      let description: Uint8Array | undefined;
      for (const entry of trak.mdia.minf.stbl.stsd.entries) {
        const box = entry.avcC ?? entry.hvcC;
        if (box) {
          const stream = new MP4Box.DataStream(undefined, 0, MP4Box.DataStream.BIG_ENDIAN);
          box.write(stream);
          description = new Uint8Array(stream.buffer, 8); // 去掉 box 头
        }
      }
      config = { codec: track.codec, codedWidth: track.video.width, codedHeight: track.video.height, description };
      file.setExtractionOptions(track.id, null, { nbSamples: track.nb_samples });
      file.start();
    };
    file.onSamples = (_id: number, _user: unknown, s: Sample[]) => {
      samples.push(...s);
    };
    (buf as ArrayBuffer & { fileStart: number }).fileStart = 0;
    file.appendBuffer(buf);
    file.flush();
    if (!config) reject(new Error('没有找到视频轨'));
    else resolve({ config, samples });
  });
}

export async function sampleSheet(url: string, times: number[], thumbW: number) {
  const { config, samples } = await demux(await (await fetch(url)).arrayBuffer());
  const W = config.codedWidth!, H = config.codedHeight!;
  const th = Math.round((thumbW * H) / W);
  const cols = Math.min(times.length, W > H ? 3 : 6);
  const sheet = document.createElement('canvas');
  sheet.width = cols * thumbW;
  sheet.height = Math.ceil(times.length / cols) * th;
  const g = sheet.getContext('2d')!;
  const want = times.map((t) => Math.round(t * 1e6));
  let done = 0;
  const decoder = new VideoDecoder({
    output: (frame) => {
      const i = want.findIndex((w) => Math.abs(frame.timestamp - w) < 17000);
      if (i >= 0) {
        g.drawImage(frame, (i % cols) * thumbW, Math.floor(i / cols) * th, thumbW, th);
        done++;
      }
      frame.close();
    },
    error: (e) => console.error(e),
  });
  decoder.configure(config);
  for (const s of samples) {
    decoder.decode(new EncodedVideoChunk({
      type: s.is_sync ? 'key' : 'delta',
      timestamp: Math.round((s.cts * 1e6) / s.timescale),
      duration: Math.round((s.duration * 1e6) / s.timescale),
      data: s.data,
    }));
  }
  await decoder.flush();
  return { sheet, frames: samples.length, matched: done, width: W, height: H };
}
