// mp4box 0.5 没有自带类型，这里只声明用到的部分（仅开发时检查宣传片用）
declare module 'mp4box' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MP4Box: any;
  export default MP4Box;
}
