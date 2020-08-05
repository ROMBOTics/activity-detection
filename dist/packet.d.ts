export default class Packet {
    count: number;
    timeMs: number;
    data: number[];
    constructor(count: number, data: number[]);
    packetCounter: () => number;
    deltaTime: () => number;
    accelX: () => number;
    accelY: () => number;
    accelZ: () => number;
    gyroX: () => number;
    gyroY: () => number;
    gyroZ: () => number;
    mag1X: () => number;
    mag1Y: () => number;
    mag1Z: () => number;
    mag2X: () => number;
    mag2Y: () => number;
    mag2Z: () => number;
    accelArray: () => number[];
    gyroArray: () => number[];
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
    };
}
