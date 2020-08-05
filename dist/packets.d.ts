import Packet from './packet';
export default class Packets {
    private packets;
    private frequency;
    constructor();
    push: (packet: Packet) => void;
    getLength: () => number;
    getFrequency: () => number;
    accelArray: () => number[][];
    deltaTimeArray: () => number[];
    accelx: (startIdx: number) => number[];
    accely: (startIdx: number) => number[];
    accelz: (startIdx: number) => number[];
    gyrox: (startIdx: number) => number[];
    gyroy: (startIdx: number) => number[];
    gyroz: (startIdx: number) => number[];
    fullMap: () => {
        count: number;
        packet_counter: number;
        delta_time: number;
        accel_X: number;
        accel_Y: number;
        accel_Z: number;
        gyro_X: number;
        gryo_Y: number;
        gyro_Z: number;
        mag1_X: number;
        mag1_Y: number;
        mag1_Z: number;
        mag2_X: number;
        mag2_Y: number;
        mag3_Z: number;
    }[];
}
