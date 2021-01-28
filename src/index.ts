import { Vector3, Quaternion } from 'three';
import { PCA } from 'ml-pca';
import {
  GLOBAL_DEFAULT_PACKET_SAMPLE_RATE,
  REP_COUNTER_DEFAULT_PEAK_PROMINENCE_FACTOR,
  REP_COUNTER_DEFAULT_WINDOW_WIDTH,
  DEFAULT_EMA_FACTOR,
  MIN_ACF_COEFF,
  MIN_EXTECTED_PEAK_PROMINENCE,
  GYRO_CONVERSION_RATIO,
  ACC_CONVERSION_RATIO,
  DEFAULT_FREQUENCY,
  REATIN_WINDOWS,
  FLUSH_SIZE,
} from './constants';
import Packets from './packets';
import { Packet, RawData } from './packet';

export interface Options {
  debug?: boolean;
  retainWindows?: number;
  flushSize?: number;
}
export interface FlushedInstancesStats {
  sum: number;
  min: number;
  length: number;
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
  private options: Options;
  private flushedReps: number = 0;
  private repsToFlush: number = 0;
  private angleCalculationPromise: Promise<number> | null = null;
  private repCalculationPromise: Promise<number> | null = null;
  private flushedInstancesStats: FlushedInstancesStats;

  constructor(
    options: Options = {
      debug: false,
      retainWindows: REATIN_WINDOWS,
      flushSize: FLUSH_SIZE,
    },
  ) {
    this.options = options;
    this.id = new Date().getTime().toString();
    this.flushedInstancesStats = { min: 0, sum: 0, length: 0 };
  }

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

  readonly globalConstants: { [key: string]: any } = {
    packetSampleRate: GLOBAL_DEFAULT_PACKET_SAMPLE_RATE,
  };

  readonly repCounterConstants: { [key: string]: any } = {
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
      // if (this.debug)
      //   console.log(`Pushing packet ${this.packetCounter} at index ${index}, delta time is ${packet.deltaTime()}}`);

      if (index > this.getWindowSize() * (this.options.retainWindows || REATIN_WINDOWS) ?? REATIN_WINDOWS) {
        this.flushIndex += 1;
        // if (this.debug)
        //   console.log(`Flush index incremented ${this.flushIndex}, window size is ${this.getWindowSize()}`);
      }
    }

    if (this.flushIndex >= (this.options.flushSize || FLUSH_SIZE)) {
      this.setStats();
      this.doFlush();
    }

    return this.packets.last();
  };
  private setStats = () => {
    this.flushedReps += this.repsToFlush;
    this.repsToFlush = 0;
    const length = this.flushIndex;
    this.flushedInstancesStats.min =
      this.flushedInstancesStats.length === 0
        ? Math.min(...this.ema.slice(length))
        : Math.min(Math.min(...this.ema.slice(length)), this.flushedInstancesStats.min);

    this.flushedInstancesStats.sum =
      this.flushedInstancesStats.sum + this.ema.slice(length).reduce((a: number, b: number) => a + b, 0);
    this.flushedInstancesStats.length += length;
  };

  doFlush = (all: boolean = false) => {
    const id = this.id;
    const index = this.flushIndex;
    this.flushIndex = -1;

    // if (this.options.debug)
    //   console.log(`Flushing packets through ${index}, total packets length: ${this.packets.getLength()}`);

    this.flush(
      new Promise<{ id: string; data: RawData[] }>((resolve, _reject) => {
        const length = all ? this.packets.getLength() : index;
        const rawData = this.packets.flush(0, length);
        if (this.options.debug) console.log(`Flushing ${rawData.length} packets `);
        if (this.options.debug) console.log(`packet size ${this.packets.getLength()} `);
        resolve({ id, data: rawData });
      }),
    );
    if (this.lastLen >= (this.options.flushSize || FLUSH_SIZE)) {
      this.lastLen -= this.options.flushSize || FLUSH_SIZE;
    }
  };

  getRepCounterIntervalMilliseconds = () => this.getWindowSize() * 15;

  getAngleMeasurementIntervalMilliseconds = () => this.getWindowSize() * 3;
  getPacketCount = () => this.packetCounter;
  getSampleCount = () => this.packets.getLength();
  getRawData = () => this.packets.fullMap();

  private calcReps = (index: number = -1): any => {
    if (this.packets.accelArray().length > 0) {
      const data = index === -1 ? this.packets.accelArray() : this.packets.accelArray().slice(index);
      const pcaModel = new PCA(data);
      const pcaScores = pcaModel.predict(data);

      const mainColumn = pcaScores.getColumn(0);

      this.emaCalc(mainColumn);

      if (this.ema.length > 2 * this.getWindowSize()) {
        const newReps = this.detectPeaks(this.ema);
        const reps = this.flushedReps + newReps;
        if (this.repsToFlush === 0 && data.length === (this.options.flushSize || FLUSH_SIZE)) {
          this.repsToFlush = newReps;
        }

        if (this.repsToFlush === 0 && data.length > (this.options.flushSize || FLUSH_SIZE)) {
          const pca = new PCA(data);
          const scores = pca.predict(data);
          const column = scores.getColumn(0);
          this.emaCalc(column);
          this.repsToFlush = this.detectPeaks(this.ema);
        }
        return reps;
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
    const mean =
      (this.flushedInstancesStats.sum + inputData.reduce((a: number, b: number) => a + b, 0)) /
      (inputData.length + this.flushedInstancesStats.length);
    const min =
      this.flushedInstancesStats.length === 0
        ? Math.min(...inputData)
        : Math.min(this.flushedInstancesStats.min, Math.min(...inputData));
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

  private calcLatestAngle = () => {
    const packetsLength = this.packets.getLength();
    if (packetsLength <= DEFAULT_FREQUENCY * 2) {
      return 0;
    }
    if (this.lastLen === 0) {
      const accxMean =
        this.packets
          .accelx(0)
          .slice(0, REP_COUNTER_DEFAULT_WINDOW_WIDTH)
          .reduce((a: number, b: number) => a + b, 0) / REP_COUNTER_DEFAULT_WINDOW_WIDTH;
      const accyMean =
        this.packets
          .accely(0)
          .slice(0, REP_COUNTER_DEFAULT_WINDOW_WIDTH)
          .reduce((a: number, b: number) => a + b, 0) / REP_COUNTER_DEFAULT_WINDOW_WIDTH;
      const acczMean =
        this.packets
          .accelz(0)
          .slice(0, REP_COUNTER_DEFAULT_WINDOW_WIDTH)
          .reduce((a: number, b: number) => a + b, 0) / REP_COUNTER_DEFAULT_WINDOW_WIDTH;

      const norm = Math.sqrt(accxMean ** 2 + accyMean ** 2 + acczMean ** 2);

      this.qUWorld = new Vector3((-1 * accxMean) / norm, (-1 * accyMean) / norm, (-1 * acczMean) / norm);
    }
    const dt = 1 / this.packets.getFrequency();
    const alpha = 0.97;
    const gyrox = this.packets.gyrox(this.lastLen, packetsLength);
    const gyroy = this.packets.gyroy(this.lastLen, packetsLength);
    const gyroz = this.packets.gyroz(this.lastLen, packetsLength);
    const accelx = this.packets.accelx(this.lastLen, packetsLength);
    const accely = this.packets.accely(this.lastLen, packetsLength);
    const accelz = this.packets.accelz(this.lastLen, packetsLength);

    for (let i = 0; i < packetsLength - this.lastLen; i++) {
      //
      const w = [gyrox[i] * GYRO_CONVERSION_RATIO, gyroy[i] * GYRO_CONVERSION_RATIO, gyroz[i] * GYRO_CONVERSION_RATIO];

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
        accelx[i] * ACC_CONVERSION_RATIO,
        accely[i] * ACC_CONVERSION_RATIO,
        accelz[i] * ACC_CONVERSION_RATIO,
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

      if (i + this.lastLen === DEFAULT_FREQUENCY * 2) {
        const h = temp.applyQuaternion(this.qC);
        this.qBase = new Vector3(h.x, h.y, h.z);
      }
    }
    const tempVector = new Vector3(this.qUWorld.x, this.qUWorld.y, this.qUWorld.z);
    const qU = tempVector.applyQuaternion(this.qC);
    const angle = Math.round((qU.angleTo(this.qBase) * 180) / Math.PI);

    this.lastLen = packetsLength;
    return angle;
  };

  calculateLatestAngle = () => {
    if (this.angleCalculationPromise != null) {
      return this.angleCalculationPromise;
    }

    this.angleCalculationPromise = new Promise<number>(resolve => {
      const latestAngle = this.calcLatestAngle();
      resolve(latestAngle);
    }).then(angle => {
      setTimeout(() => {
        this.angleCalculationPromise = null;
      }, 50);
      return angle;
    });
    return this.angleCalculationPromise;
  };

  calculateTotalReps = () => {
    if (this.repCalculationPromise != null) {
      return this.repCalculationPromise;
    }
    this.repCalculationPromise = new Promise<number>(resolve => {
      const reps = this.calcReps();
      resolve(reps);
    }).then(reps => {
      setTimeout(() => {
        this.repCalculationPromise = null;
      }, 1000);
      return reps;
    });
    return this.repCalculationPromise;
  };
}

export { RawData } from './packet';
