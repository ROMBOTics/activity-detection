import { convertFromLSBandMSBToNumber } from './util';

export interface RawData {
  count: number;
  packet_counter: number;
  delta_time: number;
  accel_X: number;
  accel_Y: number;
  accel_Z: number;
  gyro_X: number;
  gyro_Y: number;
  gyro_Z: number;
  mag1_X: number;
  mag1_Y: number;
  mag1_Z: number;
  mag2_X: number;
  mag2_Y: number;
  mag2_Z: number;
}

export class Packet {
  count: number;
  timeMs: number;
  data: number[];

  constructor(count: number, data: number[]) {
    this.count = count;
    this.timeMs = Date.now();

    this.data = data;
  }

  packetCounter = () => convertFromLSBandMSBToNumber(this.data.slice(2, 4)) || 0;
  deltaTime = () => convertFromLSBandMSBToNumber(this.data.slice(0, 2)) || 0;
  accelX = () => convertFromLSBandMSBToNumber(this.data.slice(8, 10)) || 0;
  accelY = () => convertFromLSBandMSBToNumber(this.data.slice(10, 12)) || 0;
  accelZ = () => convertFromLSBandMSBToNumber(this.data.slice(12, 14)) || 0;
  gyroX = () => convertFromLSBandMSBToNumber(this.data.slice(14, 16)) || 0;
  gyroY = () => convertFromLSBandMSBToNumber(this.data.slice(16, 18)) || 0;
  gyroZ = () => convertFromLSBandMSBToNumber(this.data.slice(18, 20)) || 0;
  mag1X = () => convertFromLSBandMSBToNumber(this.data.slice(20, 22)) || 0;
  mag1Y = () => convertFromLSBandMSBToNumber(this.data.slice(22, 24)) || 0;
  mag1Z = () => convertFromLSBandMSBToNumber(this.data.slice(24, 26)) || 0;
  mag2X = () => convertFromLSBandMSBToNumber(this.data.slice(26, 28)) || 0;
  mag2Y = () => convertFromLSBandMSBToNumber(this.data.slice(28, 30)) || 0;
  mag2Z = () => convertFromLSBandMSBToNumber(this.data.slice(30, 32)) || 0;

  accelArray = () => [this.accelX(), this.accelY()];

  gyroArray = () => [this.gyroX(), this.gyroY(), this.gyroZ()];

  fullMap = (): RawData => {
    return {
      count: this.count,
      packet_counter: this.packetCounter(),
      delta_time: this.deltaTime(),
      accel_X: this.accelX(),
      accel_Y: this.accelY(),
      accel_Z: this.accelZ(),
      gyro_X: this.gyroX(),
      gryo_Y: this.gyroY(),
      gyro_Z: this.gyroZ(),
      mag1_X: this.mag1X(),
      mag1_Y: this.mag1Y(),
      mag1_Z: this.mag1Z(),
      mag2_X: this.mag2X(),
      mag2_Y: this.mag2Y(),
      mag3_Z: this.mag2Z(),
    };
  };
}
