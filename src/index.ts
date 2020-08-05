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
} from './constants';
import Packets from './packets';
import Packet from './packet';

export default class ActivityDetection {
  private packets: Packets = new Packets();
  private packetCounter: number = 0;
  private ema: number[] = [];
  private last_len: number = 0;
  private q_c: Quaternion = new Quaternion();
  private q_base: Vector3 = new Vector3(0, 1, 0);
  private q_u_world: Vector3 = new Vector3(0, 1, 0);
  private pre_data_std: number = 0;
  private last_position: number = 0;
  private last_plank_angle: number = -1;

  private getWindowSize = () => {
    return Math.round((this.repCounterConstants.windowWidth / 90) * this.packets.getFrequency());
  };

  getPreviousSampleCount = () => {
    return this.last_len;
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

  pushData = (data: number[]) => {
    // console.log(data.length);
    this.packetCounter++;
    if (this.packetCounter % this.globalConstants.packetSampleRate)
      this.packets.push(new Packet(this.packetCounter, data));
  };

  getRepCounterIntervalMilliseconds = () => this.getWindowSize() * 15;

  getAngleMeasurementIntervalMilliseconds = () => this.getWindowSize() * 3;
  getPacketCount = () => this.packetCounter;
  getSampleCount = () => this.packets.getLength();
  getRawData = () => this.packets.fullMap();

  calculateReps = (): any => {
    if (this.packets.accelArray().length > 0) {
      const pca = new PCA(this.packets.accelArray());
      let scores = pca.predict(this.packets.accelArray());

      let column: any = scores.getColumn(0);

      this.emaCalc(column);

      if (this.ema.length > 2 * this.getWindowSize()) {
        return this.detectPeaks(this.ema);
      }
    }

    return 0;
  };

  private acf = (f: number[], s: number[]) => {
    let n = Math.min(f.length, s.length);
    f = f.slice(0, n);
    s = s.slice(0, n);

    let mean =
      (f.reduce((a: number, b: number) => a + b, 0) + s.reduce((a: number, b: number) => a + b, 0)) /
      (f.length + s.length);

    let c0 = f.reduce((acc: number, val: number) => acc + (val - mean) ** 2, 0);
    let acf_lag =
      f.reduce(function(acc: number, val: number, idx: number) {
        return acc + (val - mean) * (s[idx] - mean);
      }, 0) / c0;
    return acf_lag > MIN_ACF_COEFF;
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
    let peaks = [];
    let mins = [];
    let mean = inputData.reduce((a: number, b: number) => a + b, 0) / inputData.length;
    let threshold = Math.max(
      this.repCounterConstants.peakProminenceFactor * (mean - Math.min(...inputData)),
      MIN_EXTECTED_PEAK_PROMINENCE,
    );

    for (let i = 0; i < inputData.length; i++) {
      let start = Math.max(0, i - this.getWindowSize());
      let end = Math.min(i + this.getWindowSize(), inputData.length);

      if (
        (start == i || inputData[i] > Math.max(...inputData.slice(start, i))) &&
        (i + 1 == end || inputData[i] > Math.max(...inputData.slice(i + 1, end))) &&
        (mins.length == 0 || inputData[i] - inputData[mins[mins.length - 1]] > threshold) &&
        (peaks.length == 0 || i - peaks[peaks.length - 1] > this.getWindowSize())
      ) {
        if (peaks.length <= mins.length) peaks.push(i);
        else if (inputData[i] > inputData[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i;
      }
      if (
        (start == i || inputData[i] < Math.min(...inputData.slice(start, i))) &&
        (i + 1 == end || inputData[i] < Math.min(...inputData.slice(i + 1, end))) &&
        (peaks.length == 0 || inputData[peaks[peaks.length - 1]] - inputData[i] > threshold) &&
        (mins.length == 0 || i - mins[mins.length - 1] > this.getWindowSize())
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
      let w1 = inputData.slice(peaks[i], i < peaks.length - 1 ? peaks[i + 1] : inputData.length);
      for (let j of wIdx) {
        let w2 = inputData.slice(peaks[j], peaks[j + 1]);
        correlation = this.acf(w1, w2) || correlation;
      }
      if (correlation) rst += 1;
    }

    return rst;
  };

  private zeroCrossings = (data: number[]) => {
    let mean = data.reduce((a: number, b: number) => a + b, 0) / data.length;
    var rst = [];
    var dst = [];
    var zcount = 0;
    for (let i = 0; i < data.length; i++) {
      if ((data[i] - mean) * (data[i + 1] - mean) < 0) rst.push(i);
    }

    for (let i = 0; i < rst.length - 1; i++) dst.push(rst[i + 1] - rst[i]);

    for (let i = 0; i < dst.length; i++) if (dst[i] >= this.getWindowSize() / 4) zcount += 1;
    return Math.ceil(zcount / 2);
  };

  initializePlankParameters = () => {
    const pca = new PCA(this.packets.accelArray());
    const scores = pca.predict(this.packets.accelArray());
    let column = scores.getColumn(0);

    const pre_data_mean = column.reduce((a, b) => a + b) / column.length;
    this.pre_data_std = Math.sqrt(
      column.map(x => Math.pow(x - pre_data_mean, 2)).reduce((a, b) => a + b) / column.length,
    );

    if (this.pre_data_std < REST_MAXIMUM_STD) this.last_position = REST;
    else this.last_position = RANDOM_MOVEMENT;
  };

  isInPlankPosition = (t: number): any => {
    let n = this.packets.getLength() - this.last_len;
    let angles = this.calcAngle();
    const angles_mean = angles.reduce((a, b) => a + b) / n;
    const angle_std = Math.sqrt(angles.map(x => Math.pow(x - angles_mean, 2)).reduce((a, b) => a + b) / angles.length);

    // console.log('last postion is '+ this.last_position);
    switch (this.last_position) {
      case REST:
        // console.log('last posiotion: REST');
        if (angle_std > REST_MAXIMUM_STD) this.last_position = RANDOM_MOVEMENT;
        break;

      case RANDOM_MOVEMENT:
        // console.log('last posiotion: RANDOM MOVEMENT');
        if (
          angle_std < PLANK_MAXIMUM_STD &&
          (this.last_plank_angle === -1 || Math.abs(angles_mean - this.last_plank_angle) < 10)
        ) {
          this.last_position = PLANK;
          this.last_plank_angle = angles_mean;
        }
        break;

      case PLANK:
        if (angle_std > PLANK_MAXIMUM_STD) this.last_position = RANDOM_MOVEMENT;
        break;
    }
    return this.last_position === PLANK;
  };

  private calcAngle() {
    let angles: number[] = [];
    if (this.last_len == 0) {
      let accxMean =
        this.packets
          .accelx(0)
          .slice(0, 30)
          .reduce((a: number, b: number) => a + b, 0) / 30;
      let accyMean =
        this.packets
          .accely(0)
          .slice(0, 30)
          .reduce((a: number, b: number) => a + b, 0) / 30;
      let acczMean =
        this.packets
          .accelz(0)
          .slice(0, 30)
          .reduce((a: number, b: number) => a + b, 0) / 30;
      let norm = Math.sqrt(accxMean ** 2 + accyMean ** 2 + acczMean ** 2);

      this.q_u_world = new Vector3((-1 * accxMean) / norm, (-1 * accyMean) / norm, (-1 * acczMean) / norm);
    }
    const dt = 1 / this.repCounterConstants.windowWidth;
    const alpha = 0.97;

    for (let i = 0; i < this.packets.getLength() - this.last_len; i++) {
      let w = [
        this.packets.gyrox(this.last_len)[i] * GYRO_CONVERSION_RATIO,
        this.packets.gyroy(this.last_len)[i] * GYRO_CONVERSION_RATIO,
        this.packets.gyroz(this.last_len)[i] * GYRO_CONVERSION_RATIO,
      ];

      let w_norm = Math.sqrt(Math.pow(w[0], 2) + Math.pow(w[1], 2) + Math.pow(w[2], 2));

      let teta = dt * w_norm;

      let q_delta = new Quaternion(
        (Math.sin(teta / 2) * w[0]) / w_norm,
        (Math.sin(teta / 2) * w[1]) / w_norm,
        (Math.sin(teta / 2) * w[2]) / w_norm,
        Math.cos(teta / 2),
      );

      let q_t_dt = this.q_c.multiply(q_delta);

      let acc = [
        this.packets.accelx(this.last_len)[i] * ACC_CONVERSION_RATIO,
        this.packets.accely(this.last_len)[i] * ACC_CONVERSION_RATIO,
        this.packets.accelz(this.last_len)[i] * ACC_CONVERSION_RATIO,
      ];

      let acc_norm = Math.sqrt(Math.pow(acc[0], 2) + Math.pow(acc[1], 2) + Math.pow(acc[2], 2));

      var q_a = new Vector3(acc[0] / acc_norm, acc[1] / acc_norm, acc[2] / acc_norm);
      q_a.applyQuaternion(q_t_dt);
      let q_a_world = q_a;

      let q_a_world_norm = Math.sqrt(Math.pow(q_a_world.x, 2) + Math.pow(q_a_world.y, 2) + Math.pow(q_a_world.z, 2));

      let v_x = q_a_world.x / q_a_world_norm;
      let v_y = q_a_world.y / q_a_world_norm;
      let v_z = q_a_world.z / q_a_world_norm;

      let n_norm = Math.sqrt(Math.pow(v_z, 2) + Math.pow(v_x, 2));

      let ang = (1 - alpha) * Math.acos(v_y);

      this.q_c = new Quaternion(
        (Math.sin(ang / 2) * -v_z) / n_norm,
        0,
        (Math.sin(ang / 2) * v_x) / n_norm,
        Math.cos(ang / 2),
      ).multiply(q_t_dt);
      let temp = new Vector3(this.q_u_world.x, this.q_u_world.y, this.q_u_world.z);
      let q_u = temp.applyQuaternion(this.q_c);
      angles.push(Math.round((q_u.angleTo(this.q_base) * 180) / Math.PI));

      if (i + this.last_len == DEFAULT_FREQUENCY * 2) {
        let h = temp.applyQuaternion(this.q_c);
        this.q_base = new Vector3(h.x, h.y, h.z);
      }
    }

    this.last_len = this.packets.getLength();

    return angles;
  }
}
