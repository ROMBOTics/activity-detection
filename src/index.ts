import { Vector3, Quaternion } from 'three';
import { PCA } from 'ml-pca';
import {
  GLOBAL_DEFAULT_PACKET_SAMPLE_RATE,
  REP_COUNTER_DEFAULT_PEAK_PROMINENCE_FACTOR,
  REP_COUNTER_DEFAULT_WINDOW_WIDTH,
  DEFAULT_EMA_FACTOR,
  MIN_ACF_COEFF,
  MIN_EXTECTED_PEAK_PROMINENCE,
  REST_MAXIMUM_STD,
  REST,
  RANDOM_MOVEMENT,
  PLANK_MAXIMUM_STD,
  PLANK,
  GYRO_CONVERSION_RATIO,
  ACC_CONVERSION_RATIO,
  DEFAULT_FREQUENCY,
  REATIN_WINDOWS,
  FLUSH_SIZE,
} from './constants';
import Packets from './packets';
import { Packet, RawData } from './packet';

export interface Options {
  debug?: boolean,
  retainWindows?: number,
  flushSize?: number
}

export class ActivityDetection {
  private id: string;
  private packets: Packets = new Packets();
  private packetCounter: number = 0;
  private ema: number[] = [];
  private lastLen: number = 0;
  private qC: Quaternion = new Quaternion();
  private qBase: Vector3 = new Vector3(0, 1, 0);
  private qUWorld: Vector3 = new Vector3(0, 1, 0);
  private preDataStd: number = 0;
  private lastPosition: number = 0;
  private lastPlankAngle: number = -1;
  private flushIndex: number = -1;
  // private debug: boolean = false;
  // private retainWindows: number = REATIN_WINDOWS;
  // private flushSize: number = FLUSH_SIZE;
  private options: Options ;


  


  constructor(options: Options = {
    debug:false,
    retainWindows: REATIN_WINDOWS,
    flushSize: FLUSH_SIZE
    }){
      this.options = options;
      this.id = new Date().getTime().toString(); 
    };
  

  private flush = (promise: Promise<{ id: string; data: RawData[] }>) => {
    if (this.options.debug) console.log(`Flush ignored`);
    return;
  };

  setFlushHandler = (fn: (promise: Promise<{ id: string; data: RawData[] }>) => void) => {
    if (this.options.debug) console.log(`Setting flush handler to: ${fn}`);
    this.flush = fn;
  };

  private getWindowSize = () => {
    return Math.round((this.repCounterConstants.windowWidth / 90) * this.packets.getFrequency());
  };

  getPreviousSampleCount = () => {
    return this.lastLen;
  };

  private globalConstants: { [key: string]: any } = {
    packetSampleRate: GLOBAL_DEFAULT_PACKET_SAMPLE_RATE,
  };

  private repCounterConstants: { [key: string]: any } = {
    peakProminenceFactor: REP_COUNTER_DEFAULT_PEAK_PROMINENCE_FACTOR,
    windowWidth: REP_COUNTER_DEFAULT_WINDOW_WIDTH,
    ema_factor: DEFAULT_EMA_FACTOR,
  };

  putGlobalConstant = ([name, value]: [string, number]) => {
    this.globalConstants[name] = value;
  };

  putRepCalculationConstant = ([name, value]: [string, any]) => {
    this.repCounterConstants[name] = parseFloat(value);
  };

  pushData = async (data: number[]) => {
    this.packetCounter++;
    if (this.packetCounter % this.globalConstants.packetSampleRate) {
      const packet = new Packet(this.packetCounter, data);
      const index = this.packets.push(packet);
      if (this.options.debug)
        console.log(`Pushing packet ${this.packetCounter} at index ${index}, delta time is ${packet.deltaTime()}}`);

      if (index > this.getWindowSize() * (this.options.retainWindows || REATIN_WINDOWS) ?? REATIN_WINDOWS) {
        this.flushIndex += 1;
        if (this.options.debug)
          console.log(`Flush index incremented ${this.flushIndex}, window size is ${this.getWindowSize()}`);
      }
    }

    if (this.flushIndex >= (this.options.flushSize || FLUSH_SIZE) ) {
      this.doFlush();
    }

    return this.packets.last();
  };

  doFlush = (all: boolean = false) => {
    const id = this.id;
    const index = this.flushIndex;
    this.flushIndex = -1;

    if (this.options.debug) console.log(`Flushing packets through ${index}, total packets length: ${this.packets.getLength()}`);

    this.flush(
      new Promise<{ id: string; data: RawData[] }>((resolve, _reject) => {
        const length = all ? this.packets.getLength() : index;
        const rawData = this.packets.flush(0, length);
        if (this.options.debug) console.log(`Fushing ${rawData.length} packets`);
        resolve({ id, data: rawData });
      }),
    );
  };

  getRepCounterIntervalMilliseconds = () => this.getWindowSize() * 15;

  getAngleMeasurementIntervalMilliseconds = () => this.getWindowSize() * 3;
  getPacketCount = () => this.packetCounter;
  getSampleCount = () => this.packets.getLength();
  getRawData = () => this.packets.fullMap();

  calculateReps = (): any => {
    if (this.packets.accelArray().length > 0) {
      const pca = new PCA(this.packets.accelArray());
      const scores = pca.predict(this.packets.accelArray());

      const column = scores.getColumn(0);

      this.emaCalc(column);

      if (this.ema.length > 2 * this.getWindowSize()) {
        return this.detectPeaks(this.ema);
      }
    }

    return 0;
  };

  private acf = (f: number[], s: number[]) => {
    const n = Math.min(f.length, s.length);
    f = f.slice(0, n);
    s = s.slice(0, n);

    const mean =
      (f.reduce((a: number, b: number) => a + b, 0) + s.reduce((a: number, b: number) => a + b, 0)) /
      (f.length + s.length);

    const c0 = f.reduce((acc: number, val: number) => acc + (val - mean) ** 2, 0);
    const acfLag =
      f.reduce((acc: number, val: number, idx: number) => {
        return acc + (val - mean) * (s[idx] - mean);
      }, 0) / c0;
    return acfLag > MIN_ACF_COEFF;
  };

  private emaCalc = (mArray: number[]) => {
    const k = this.repCounterConstants.ema_factor;
    this.ema = [mArray[0]];

    for (let i = 1; i < mArray.length; i++) {
      this.ema.push(mArray[i] * k + this.ema[i - 1] * (1 - k));
    }
  };

  private range(start = 0, end: number) {
    return Array.from(Array(end - start).keys()).map(i => i + start);
  }

  private detectPeaks = (inputData: number[]) => {
    const peaks = [];
    const mins = [];
    const mean = inputData.reduce((a: number, b: number) => a + b, 0) / inputData.length;
    const threshold = Math.max(
      this.repCounterConstants.peakProminenceFactor * (mean - Math.min(...inputData)),
      MIN_EXTECTED_PEAK_PROMINENCE,
    );

    for (let i = 0; i < inputData.length; i++) {
      const start = Math.max(0, i - this.getWindowSize());
      const end = Math.min(i + this.getWindowSize(), inputData.length);

      if (
        (start === i || inputData[i] > Math.max(...inputData.slice(start, i))) &&
        (i + 1 === end || inputData[i] > Math.max(...inputData.slice(i + 1, end))) &&
        (mins.length === 0 || inputData[i] - inputData[mins[mins.length - 1]] > threshold) &&
        (peaks.length === 0 || i - peaks[peaks.length - 1] > this.getWindowSize())
      ) {
        if (peaks.length <= mins.length) peaks.push(i);
        else if (inputData[i] > inputData[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
      }
      if (
        (start === i || inputData[i] < Math.min(...inputData.slice(start, i))) &&
        (i + 1 === end || inputData[i] < Math.min(...inputData.slice(i + 1, end))) &&
        (peaks.length === 0 || inputData[peaks[peaks.length - 1]] - inputData[i] > threshold) &&
        (mins.length === 0 || i - mins[mins.length - 1] > this.getWindowSize())
      ) {
        if (mins.length <= peaks.length) mins.push(i);
        else if (inputData[i] < inputData[mins[mins.length - 1]]) mins[mins.length - 1] = i;
      }
    }

    let rst = 0;
    for (let i = 0; i < peaks.length; i++) {
      // console.log('i is :'+ i);
      let wIdx: number[];
      switch (i) {
        case 0:
          wIdx = this.range(1, Math.min(6, peaks.length));
          break;
        case 1:
          wIdx = this.range(2, Math.min(6, peaks.length));
          wIdx.push(0);
          break;
        default:
          wIdx = [i - 2, i - 1];
          i + 1 < peaks.length ? wIdx.push(i + 1) : i - 3 > 0 ? wIdx.push(i - 3) : wIdx.push(0);

          i + 2 < peaks.length ? wIdx.push(i + 2) : i - 4 > 0 ? wIdx.push(i - 4) : wIdx.push(0);
      }
      let correlation = false;
      const w1 = inputData.slice(peaks[i], i < peaks.length - 1 ? peaks[i + 1] : inputData.length);
      for (const j of wIdx) {
        const w2 = inputData.slice(peaks[j], peaks[j + 1]);
        correlation = this.acf(w1, w2) || correlation;
      }
      if (correlation) rst += 1;
    }

    return rst;
  };

  private zeroCrossings = (data: number[]) => {
    const mean = data.reduce((a: number, b: number) => a + b, 0) / data.length;
    const rst = [];
    const dst = [];
    let zcount = 0;
    for (let i = 0; i < data.length; i++) {
      if ((data[i] - mean) * (data[i + 1] - mean) < 0) rst.push(i);
    }

    for (let i = 0; i < rst.length - 1; i++) dst.push(rst[i + 1] - rst[i]);

    for (const d of dst) if (d >= this.getWindowSize() / 4) zcount += 1;
    return Math.ceil(zcount / 2);
  };

  initializePlankParameters = () => {
    const pca = new PCA(this.packets.accelArray());
    const scores = pca.predict(this.packets.accelArray());
    const column = scores.getColumn(0);

    const preDataMean = column.reduce((a, b) => a + b) / column.length;
    this.preDataStd = Math.sqrt(column.map(x => Math.pow(x - preDataMean, 2)).reduce((a, b) => a + b) / column.length);

    if (this.preDataStd < REST_MAXIMUM_STD) this.lastPosition = REST;
    else this.lastPosition = RANDOM_MOVEMENT;
  };

  isInPlankPosition = (t: number): any => {
    const n = this.packets.getLength() - this.lastLen;
    const angles = this.calcAngle();
    const anglesMean = angles.reduce((a, b) => a + b) / n;
    const angleStd = Math.sqrt(angles.map(x => Math.pow(x - anglesMean, 2)).reduce((a, b) => a + b) / angles.length);

    // console.log('last postion is '+ this.lastPosition);
    switch (this.lastPosition) {
      case REST:
        // console.log('last posiotion: REST');
        if (angleStd > REST_MAXIMUM_STD) this.lastPosition = RANDOM_MOVEMENT;
        break;

      case RANDOM_MOVEMENT:
        // console.log('last posiotion: RANDOM MOVEMENT');
        if (
          angleStd < PLANK_MAXIMUM_STD &&
          (this.lastPlankAngle === -1 || Math.abs(anglesMean - this.lastPlankAngle) < 10)
        ) {
          this.lastPosition = PLANK;
          this.lastPlankAngle = anglesMean;
        }
        break;

      case PLANK:
        if (angleStd > PLANK_MAXIMUM_STD) this.lastPosition = RANDOM_MOVEMENT;
        break;
    }
    return this.lastPosition === PLANK;
  };

  calcAngle = () => {
    const angles: number[] = [];
    if (this.packets.getLength()< REP_COUNTER_DEFAULT_WINDOW_WIDTH){
      return []
    }
    if (this.lastLen === 0) {
      const accxMean =
        this.packets
          .accelx(0)
          .slice(0, REP_COUNTER_DEFAULT_WINDOW_WIDTH)
          .reduce((a: number, b: number) => a + b , 0) / REP_COUNTER_DEFAULT_WINDOW_WIDTH;
      const accyMean =
        this.packets
          .accely(0)
          .slice(0, REP_COUNTER_DEFAULT_WINDOW_WIDTH)
          .reduce((a: number, b: number) => a + b , 0) / REP_COUNTER_DEFAULT_WINDOW_WIDTH;
      const acczMean =
        this.packets
          .accelz(0)
          .slice(0, REP_COUNTER_DEFAULT_WINDOW_WIDTH)
          .reduce((a: number, b: number) => a + b , 0) / REP_COUNTER_DEFAULT_WINDOW_WIDTH;
        
      const norm = Math.sqrt(accxMean ** 2 + accyMean ** 2 + acczMean ** 2);

      this.qUWorld = new Vector3((-1 * accxMean) / norm, (-1 * accyMean) / norm, (-1 * acczMean) / norm);
    }
    const dt = 1 / this.packets.getFrequency();
    const alpha = 0.97;

    for (let i = 0; i < this.packets.getLength() - this.lastLen; i++) {
      const w = [
        this.packets.gyrox(this.lastLen)[i] * GYRO_CONVERSION_RATIO,
        this.packets.gyroy(this.lastLen)[i] * GYRO_CONVERSION_RATIO,
        this.packets.gyroz(this.lastLen)[i] * GYRO_CONVERSION_RATIO,
      ];

      const wNorm = Math.sqrt(Math.pow(w[0], 2) + Math.pow(w[1], 2) + Math.pow(w[2], 2));

      const teta = dt * wNorm;

      const qDelta = new Quaternion(
        (Math.sin(teta / 2) * w[0]) / wNorm,
        (Math.sin(teta / 2) * w[1]) / wNorm,
        (Math.sin(teta / 2) * w[2]) / wNorm,
        Math.cos(teta / 2),
      );

      const qTDt = this.qC.multiply(qDelta);

      const acc = [
        this.packets.accelx(this.lastLen)[i] * ACC_CONVERSION_RATIO,
        this.packets.accely(this.lastLen)[i] * ACC_CONVERSION_RATIO,
        this.packets.accelz(this.lastLen)[i] * ACC_CONVERSION_RATIO,
      ];

      const accNorm = Math.sqrt(Math.pow(acc[0], 2) + Math.pow(acc[1], 2) + Math.pow(acc[2], 2));

      const qA = new Vector3(acc[0] / accNorm, acc[1] / accNorm, acc[2] / accNorm);
      qA.applyQuaternion(qTDt);
      const qAWorld = qA;

      const qAWorldNorm = Math.sqrt(Math.pow(qAWorld.x, 2) + Math.pow(qAWorld.y, 2) + Math.pow(qAWorld.z, 2));

      const vX = qAWorld.x / qAWorldNorm;
      const vY = qAWorld.y / qAWorldNorm;
      const vZ = qAWorld.z / qAWorldNorm;

      const nNorm = Math.sqrt(Math.pow(vZ, 2) + Math.pow(vX, 2));

      const ang = (1 - alpha) * Math.acos(vY);

      this.qC = new Quaternion(
        (Math.sin(ang / 2) * -vZ) / nNorm,
        0,
        (Math.sin(ang / 2) * vX) / nNorm,
        Math.cos(ang / 2),
      ).multiply(qTDt);
      const temp = new Vector3(this.qUWorld.x, this.qUWorld.y, this.qUWorld.z);
      const temp2 = new Vector3(this.qUWorld.x, this.qUWorld.y, this.qUWorld.z);
      const qU = temp.applyQuaternion(this.qC);
      angles.push(Math.round((qU.angleTo(this.qBase) * 180) / Math.PI));

      if (i + this.lastLen === DEFAULT_FREQUENCY * 2) {
        const h = temp2.applyQuaternion(this.qC);
        this.qBase = new Vector3(h.x, h.y, h.z);
      }
    }
    this.lastLen = this.packets.getLength();
    return angles;
    
  }
}

export { RawData } from './packet';
