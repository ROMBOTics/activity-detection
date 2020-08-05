"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Packets {
    constructor() {
        this.push = (packet) => {
            this.packets.push(packet);
            this.frequency = Math.round(this.getLength() / (this.packets[this.packets.length - 1].deltaTime() - this.packets[0].deltaTime()) + 1);
        };
        this.getLength = () => {
            return this.packets.length;
        };
        this.getFrequency = () => {
            return this.frequency;
        };
        this.accelArray = () => {
            return this.packets.map(packet => {
                const accelArray = packet.accelArray() || [];
                return accelArray;
            });
        };
        this.deltaTimeArray = () => this.packets.map(packet => {
            return packet.deltaTime();
        });
        this.accelx = (startIdx) => this.packets.slice(startIdx, this.packets.length).map(packet => {
            return packet.accelX();
        });
        this.accely = (startIdx) => this.packets.slice(startIdx, this.packets.length).map(packet => {
            return packet.accelY();
        });
        this.accelz = (startIdx) => this.packets.slice(startIdx, this.packets.length).map(packet => {
            return packet.accelZ();
        });
        this.gyrox = (startIdx) => this.packets.slice(startIdx, this.packets.length).map(packet => {
            return packet.gyroX();
        });
        this.gyroy = (startIdx) => this.packets.slice(startIdx, this.packets.length).map(packet => {
            return packet.gyroY();
        });
        this.gyroz = (startIdx) => this.packets.slice(startIdx, this.packets.length).map(packet => {
            return packet.gyroZ();
        });
        this.fullMap = () => this.packets.map(packet => {
            return packet.fullMap();
        });
        this.packets = [];
        this.frequency = 0;
    }
}
exports.default = Packets;
