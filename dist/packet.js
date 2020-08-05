"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
class Packet {
    constructor(count, data) {
        this.packetCounter = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(2, 4)) || 0;
        this.deltaTime = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(0, 2)) || 0;
        this.accelX = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(8, 10)) || 0;
        this.accelY = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(10, 12)) || 0;
        this.accelZ = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(12, 14)) || 0;
        this.gyroX = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(14, 16)) || 0;
        this.gyroY = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(16, 18)) || 0;
        this.gyroZ = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(18, 20)) || 0;
        this.mag1X = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(20, 22)) || 0;
        this.mag1Y = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(22, 24)) || 0;
        this.mag1Z = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(24, 26)) || 0;
        this.mag2X = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(26, 28)) || 0;
        this.mag2Y = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(28, 30)) || 0;
        this.mag2Z = () => util_1.convertFromLSBandMSBToNumber(this.data.slice(30, 32)) || 0;
        this.accelArray = () => [this.accelX(), this.accelY()];
        this.gyroArray = () => [this.gyroX(), this.gyroY(), this.gyroZ()];
        this.fullMap = () => {
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
        this.count = count;
        this.timeMs = Date.now();
        this.data = data;
    }
}
exports.default = Packet;
