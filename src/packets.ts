import { Packet, RawData } from './packet';

export default class Packets {
  private packets: Packet[];
  private frequency: number;

  constructor() {
    this.packets = [];
    this.frequency = 0;
  }

  push = (packet: Packet) => {
    const index = this.packets.push(packet);
    this.frequency = Math.round(this.getLength() / this.calcDeltaTime() + 1);
    return index;
  };

  at = (index: number) => {
    return this.packets[index];
  };

  last = () => {
    return this.packets.slice(-1).pop();
  };

  getLength = () => {
    return this.packets.length;
  };

  calcDeltaTime = () => {
    let start = 0;
    let dtime = 0;
    let idx = 1;
    while (idx < this.packets.length) {
      if (this.packets[idx].deltaTime() < this.packets[idx - 1].deltaTime()) {
        dtime += this.packets[idx - 1].deltaTime() - this.packets[start].deltaTime() + 1;
        start = idx;
      }
      idx += 1;
    }
    dtime += this.packets[idx - 1].deltaTime() - this.packets[start].deltaTime() + 1;
    return dtime;
  };
  getFrequency = () => {
    return this.frequency;
  };

  accelArray = () => {
    return this.packets.map(packet => {
      const accelArray: number[] = packet.accelArray() || [];
      return accelArray;
    });
  };

  gyroArray = () => {
    return this.packets.map(packet => {
      const gyroArray: number[] = packet.gyroArray() || [];
      return gyroArray;
    });
  };

  deltaTimeArray = () =>
    this.packets.map(packet => {
      return packet.deltaTime();
    });

  accelx = (startIdx: number) =>
    this.packets.slice(startIdx, this.packets.length).map(packet => {
      return packet.accelX();
    });
  accely = (startIdx: number) =>
    this.packets.slice(startIdx, this.packets.length).map(packet => {
      return packet.accelY();
    });
  accelz = (startIdx: number) =>
    this.packets.slice(startIdx, this.packets.length).map(packet => {
      return packet.accelZ();
    });
  gyrox = (startIdx: number) =>
    this.packets.slice(startIdx, this.packets.length).map(packet => {
      return packet.gyroX();
    });
  gyroy = (startIdx: number) =>
    this.packets.slice(startIdx, this.packets.length).map(packet => {
      return packet.gyroY();
    });
  gyroz = (startIdx: number) =>
    this.packets.slice(startIdx, this.packets.length).map(packet => {
      return packet.gyroZ();
    });

  fullMap = (): RawData[] =>
    this.packets.map(packet => {
      return packet.fullMap();
    });

  flush = (start: number, end: number) => {
    const flushPackets = this.packets.slice(start, end);
    this.packets = this.packets.slice(end);
    return flushPackets.map(packet => {
      return packet.fullMap();
    });
  };
}
