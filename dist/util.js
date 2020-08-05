"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const MAX_16_BIT = 65536;
const MAX_POSITIVE_VALUE = Math.pow(2, 15);
function convertFromLSBandMSBToNumber(byteArray) {
    if (!(byteArray && byteArray.length)) {
        return;
    }
    const [LSM, MSB] = byteArray;
    let converted = (LSM | (MSB << 8)) & 0xffff;
    if (converted > MAX_POSITIVE_VALUE) {
        converted = converted - MAX_16_BIT;
    }
    return converted;
}
exports.convertFromLSBandMSBToNumber = convertFromLSBandMSBToNumber;
