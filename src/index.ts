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
  private angleCalculationPromise: Promise<number[]> | null = null;
  private repsCalculationPromise: Promise<number[]> | null = null;
  private flushedInstancesStats: FlushedInstancesStats;

  constructor(
    options: Options = {
      debug: false,
      retainWindows: REATIN_WINDOWS,
      flushSize: FLUSH_SIZE,
      // doFlush: true,
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
      // if (this.debug)
      //   console.log(`Pushing packet ${this.packetCounter} at index ${index}, delta time is ${packet.deltaTime()}}`);

      if (index > this.getWindowSize() * (this.options.retainWindows || REATIN_WINDOWS) ?? REATIN_WINDOWS) {
        this.flushIndex += 1;
        // if (this.debug)
        //   console.log(`Flush index incremented ${this.flushIndex}, window size is ${this.getWindowSize()}`);
      }
    }

    if (this.flushIndex >= (this.options.flushSize || FLUSH_SIZE)) {
      console.log('push data');
      this.doFlush();
    }

    return this.packets.last();
  };

  doFlush = (all: boolean = false) => {
    console.log('do flush');
    this.flushedReps += this.repsToFlush;
    this.repsToFlush = 0;
    const id = this.id;
    const index = this.flushIndex;
    this.flushIndex = -1;

    // if (this.options.debug)
    //   console.log(`Flushing packets through ${index}, total packets length: ${this.packets.getLength()}`);

    this.flush(
      new Promise<{ id: string; data: RawData[] }>((resolve, _reject) => {
        const length = all ? this.packets.getLength() : index;
        const rawData = this.packets.flush(0, length);

        this.flushedInstancesStats.min =
          this.flushedInstancesStats.length === 0
            ? Math.min(...this.ema.slice(length))
            : Math.min(Math.min(...this.ema.slice(length)), this.flushedInstancesStats.min);

        this.flushedInstancesStats.sum =
          this.flushedInstancesStats.sum + this.ema.slice(length).reduce((a: number, b: number) => a + b, 0);
        this.flushedInstancesStats.length += length;

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

  calcReps = (index: number = -1): any => {
    if (this.packets.accelArray().length > 0) {
      const data = index == -1 ? this.packets.accelArray() : this.packets.accelArray().slice(index);
      const pca = new PCA(data);
      const scores = pca.predict(data);

      const column = scores.getColumn(0);

      this.emaCalc(column);

      if (this.ema.length > 2 * this.getWindowSize()) {
        const newReps = this.detectPeaks(this.ema);
        const reps = this.flushedReps + newReps;
        console.log('flushedReps ', this.flushedReps);
        if (this.repsToFlush === 0 && data.length === (this.options.flushSize || FLUSH_SIZE)) {
          this.repsToFlush = newReps;
          console.log('repsToFlush ', this.repsToFlush);
        }

        if (this.repsToFlush === 0 && data.length > (this.options.flushSize || FLUSH_SIZE)) {
          console.log('data length is ', data.length);
          const pca = new PCA(data);
          const scores = pca.predict(data);
          const column = scores.getColumn(0);
          this.emaCalc(column);
          this.repsToFlush = this.detectPeaks(this.ema);
          console.log('2. repsToFlush ', this.repsToFlush);
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

    const preDataMean = column.reduce((a: number, b: number) => a + b) / column.length;
    this.preDataStd = Math.sqrt(
      column.map((x: number) => Math.pow(x - preDataMean, 2)).reduce((a: number, b: number) => a + b) / column.length,
    );

    if (this.preDataStd < REST_MAXIMUM_STD) this.lastPosition = REST;
    else this.lastPosition = RANDOM_MOVEMENT;
  };

  isInPlankPosition = async (t: number) => {
    const n = this.packets.getLength() - this.lastLen;
    const angles = (await this.calculateAngles()) || [];
    const anglesMean = angles.reduce((a, b) => a + b) / n;
    const angleStd = Math.sqrt(angles.map(x => Math.pow(x - anglesMean, 2)).reduce((a, b) => a + b) / angles.length);

    switch (this.lastPosition) {
      case REST:
        if (angleStd > REST_MAXIMUM_STD) this.lastPosition = RANDOM_MOVEMENT;
        break;

      case RANDOM_MOVEMENT:
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
  calcAngles = () => {
    const angles: number[] = [];
    if (this.packets.getLength() < DEFAULT_FREQUENCY * 2) {
      return [];
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
    const startTime = new Date().getTime();
    const dt = 1 / this.packets.getFrequency();
    const alpha = 0.97;
    const gyrox = this.packets.gyrox(this.lastLen);
    const gyroy = this.packets.gyroy(this.lastLen);
    const gyroz = this.packets.gyroz(this.lastLen);
    const accelx = this.packets.accelx(this.lastLen);
    const accely = this.packets.accely(this.lastLen);
    const accelz = this.packets.accelz(this.lastLen);

    for (let i = 0; i < this.packets.getLength() - this.lastLen; i++) {
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
  };
  calculateAngles = () => {
    if (this.angleCalculationPromise != null) {
      return this.angleCalculationPromise;
    }

    this.angleCalculationPromise = new Promise<number[]>(resolve => {
      const angles = this.calcAngles();
      resolve(angles);
    }).then(angles => {
      setTimeout(() => {
        this.angleCalculationPromise = null;
      }, 50);
      return angles;
    });
    return this.angleCalculationPromise;
  };

  calculateReps = () => {
    if (this.repsCalculationPromise != null) {
      return this.repsCalculationPromise;
    }
    this.repsCalculationPromise = new Promise<number[]>(resolve => {
      const reps = this.calcReps();
      resolve(reps);
    }).then(reps => {
      setTimeout(() => {
        this.repsCalculationPromise = null;
      }, 1000);
      return reps;
    });
    return this.repsCalculationPromise;
  };
}

export { RawData } from './packet';
