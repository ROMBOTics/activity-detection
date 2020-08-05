"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const three_1 = require("three");
const ml_pca_1 = require("ml-pca");
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
exports.Packet = Packet;
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
class ActivityDetection {
    constructor() {
        this.REP_COUNTER_DEFAULT_PEAK_PROMINENCE_FACTOR = 0.4;
        this.REP_COUNTER_DEFAULT_WINDOW_WIDTH = 70;
        this.GLOBAL_DEFAULT_PACKET_SAMPLE_RATE = 2;
        this.MIN_EXTECTED_PEAK_PROMINENCE = 600;
        this.DEFAULT_EMA_FACTOR = 0.01;
        this.MIN_ACF_COEFF = 0.5;
        this.GYRO_CONVERSION_RATIO = (2000 * Math.PI) / (32768 * 180);
        this.ACC_CONVERSION_RATIO = (2 * 9.81) / 32768;
        this.DEFAULT_FREQUENCY = 90;
        this.REST = 0;
        this.PLANK = 1;
        this.RANDOM_MOVEMENT = 2;
        this.REST_MAXIMUM_STD = 0.2;
        this.PLANK_MAXIMUM_STD = 2;
        this.packets = new Packets();
        this.packetCounter = 0;
        this.ema = [];
        this.last_len = 0;
        this.q_c = new three_1.Quaternion();
        this.q_base = new three_1.Vector3(0, 1, 0);
        this.q_u_world = new three_1.Vector3(0, 1, 0);
        this.pre_data_std = 0;
        this.last_position = 0;
        this.last_plank_angle = -1;
        this.getWindowSize = () => {
            return Math.round((this.repCounterConstants.windowWidth / 90) * this.packets.getFrequency());
        };
        this.getPreviousSampleCount = () => {
            return this.last_len;
        };
        this.globalConstants = {
            packetSampleRate: this.GLOBAL_DEFAULT_PACKET_SAMPLE_RATE,
        };
        this.repCounterConstants = {
            peakProminenceFactor: this.REP_COUNTER_DEFAULT_PEAK_PROMINENCE_FACTOR,
            windowWidth: this.REP_COUNTER_DEFAULT_WINDOW_WIDTH,
            ema_factor: this.DEFAULT_EMA_FACTOR,
        };
        this.putGlobalConstant = ([name, value]) => {
            this.globalConstants[name] = value;
        };
        this.putRepCalculationConstant = ([name, value]) => {
            this.repCounterConstants[name] = parseFloat(value);
        };
        this.pushData = (data) => {
            // console.log(data.length);
            this.packetCounter++;
            if (this.packetCounter % this.globalConstants.packetSampleRate)
                this.packets.push(new Packet(this.packetCounter, data));
        };
        this.getRepCounterIntervalMilliseconds = () => this.getWindowSize() * 15;
        this.getAngleMeasurementIntervalMilliseconds = () => this.getWindowSize() * 3;
        this.getPacketCount = () => this.packetCounter;
        this.getSampleCount = () => this.packets.getLength();
        this.getRawData = () => this.packets.fullMap();
        this.calculateReps = () => {
            if (this.packets.accelArray().length > 0) {
                // let ar = array(this.packets.accelArray());
                const pca = new ml_pca_1.PCA(this.packets.accelArray());
                let scores = pca.predict(this.packets.accelArray());
                // console.log('scores is '+ scores.getColumn(0));
                let column = scores.getColumn(0);
                this.emaCalc(column);
                if (this.ema.length > 2 * this.getWindowSize()) {
                    let p = this.detectPeaks(this.ema);
                    // console.log('peaks is '+ peaks);
                    // let count: { [key: number]: number } = {};
                    // peaks.forEach(val => (count[val] = (count[val] || 0) + 1));
                    // let repCount = Object.keys(count).reduce(function(a, b) {
                    //   return count[a] > count[b] ? a : b;
                    // });
                    return p;
                }
            }
            return 0;
        };
        this.acf = (f, s) => {
            let n = Math.min(f.length, s.length);
            f = f.slice(0, n);
            s = s.slice(0, n);
            let mean = (f.reduce((a, b) => a + b, 0) + s.reduce((a, b) => a + b, 0)) /
                (f.length + s.length);
            let c0 = f.reduce((acc, val) => acc + Math.pow((val - mean), 2), 0);
            let acf_lag = f.reduce(function (acc, val, idx) {
                return acc + (val - mean) * (s[idx] - mean);
            }, 0) / c0;
            // console.log('acf is:' + acf_lag);
            return acf_lag > this.MIN_ACF_COEFF;
        };
        this.emaCalc = (mArray) => {
            const k = this.repCounterConstants.ema_factor;
            this.ema = [mArray[0]];
            // if (this.ema.length == 0) {
            //   this.ema.push();
            // }
            // let start = this.ema.length;
            for (let i = 1; i < mArray.length; i++) {
                this.ema.push(mArray[i] * k + this.ema[i - 1] * (1 - k));
            }
        };
        this.detectPeaks = (inputData) => {
            let peaks = [];
            let mins = [];
            let mean = inputData.reduce((a, b) => a + b, 0) / inputData.length;
            let threshold = Math.max(this.repCounterConstants.peakProminenceFactor * (mean - Math.min(...inputData)), this.MIN_EXTECTED_PEAK_PROMINENCE);
            for (let i = 0; i < inputData.length; i++) {
                let start = Math.max(0, i - this.getWindowSize());
                let end = Math.min(i + this.getWindowSize(), inputData.length);
                if ((start == i || inputData[i] > Math.max(...inputData.slice(start, i))) &&
                    (i + 1 == end || inputData[i] > Math.max(...inputData.slice(i + 1, end))) &&
                    (mins.length == 0 || inputData[i] - inputData[mins[mins.length - 1]] > threshold) &&
                    (peaks.length == 0 || i - peaks[peaks.length - 1] > this.getWindowSize())) {
                    if (peaks.length <= mins.length)
                        peaks.push(i);
                    else if (inputData[i] > inputData[peaks[peaks.length - 1]])
                        peaks[peaks.length - 1] = i;
                }
                if ((start == i || inputData[i] < Math.min(...inputData.slice(start, i))) &&
                    (i + 1 == end || inputData[i] < Math.min(...inputData.slice(i + 1, end))) &&
                    (peaks.length == 0 || inputData[peaks[peaks.length - 1]] - inputData[i] > threshold) &&
                    (mins.length == 0 || i - mins[mins.length - 1] > this.getWindowSize())) {
                    if (mins.length <= peaks.length)
                        mins.push(i);
                    else if (inputData[i] < inputData[mins[mins.length - 1]])
                        mins[mins.length - 1] = i;
                }
            }
            let rst = 0;
            for (let i = 0; i < peaks.length; i++) {
                // console.log('i is :'+ i);
                let wIdx;
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
                if (correlation)
                    rst += 1;
            }
            return rst;
        };
        this.zeroCrossings = (data) => {
            let mean = data.reduce((a, b) => a + b, 0) / data.length;
            var rst = [];
            var dst = [];
            var zcount = 0;
            for (let i = 0; i < data.length; i++) {
                if ((data[i] - mean) * (data[i + 1] - mean) < 0)
                    rst.push(i);
            }
            for (let i = 0; i < rst.length - 1; i++)
                dst.push(rst[i + 1] - rst[i]);
            for (let i = 0; i < dst.length; i++)
                if (dst[i] >= this.getWindowSize() / 4)
                    zcount += 1;
            return Math.ceil(zcount / 2);
        };
        this.initializePlankParameters = () => {
            const pca = new ml_pca_1.PCA(this.packets.accelArray());
            const scores = pca.predict(this.packets.accelArray());
            let column = scores.getColumn(0);
            const pre_data_mean = column.reduce((a, b) => a + b) / column.length;
            this.pre_data_std = Math.sqrt(column.map(x => Math.pow(x - pre_data_mean, 2)).reduce((a, b) => a + b) / column.length);
            if (this.pre_data_std < this.REST_MAXIMUM_STD)
                this.last_position = this.REST;
            else
                this.last_position = this.RANDOM_MOVEMENT;
        };
        this.isInPlankPosition = (t) => {
            let n = this.packets.getLength() - this.last_len;
            let angles = this.calcAngle();
            const angles_mean = angles.reduce((a, b) => a + b) / n;
            const angle_std = Math.sqrt(angles.map(x => Math.pow(x - angles_mean, 2)).reduce((a, b) => a + b) / angles.length);
            // console.log('last postion is '+ this.last_position);
            switch (this.last_position) {
                case this.REST:
                    // console.log('last posiotion: REST');
                    if (angle_std > this.REST_MAXIMUM_STD)
                        this.last_position = this.RANDOM_MOVEMENT;
                    break;
                case this.RANDOM_MOVEMENT:
                    // console.log('last posiotion: RANDOM MOVEMENT');
                    if (angle_std < this.PLANK_MAXIMUM_STD &&
                        (this.last_plank_angle === -1 || Math.abs(angles_mean - this.last_plank_angle) < 10)) {
                        this.last_position = this.PLANK;
                        this.last_plank_angle = angles_mean;
                    }
                    break;
                case this.PLANK:
                    if (angle_std > this.PLANK_MAXIMUM_STD)
                        this.last_position = this.RANDOM_MOVEMENT;
                    break;
            }
            return this.last_position === this.PLANK;
        };
    }
    range(start = 0, end) {
        return Array.from(Array(end - start).keys()).map(i => i + start);
    }
    calcAngle() {
        let angles = [];
        if (this.last_len == 0) {
            let accxMean = this.packets
                .accelx(0)
                .slice(0, 30)
                .reduce((a, b) => a + b, 0) / 30;
            let accyMean = this.packets
                .accely(0)
                .slice(0, 30)
                .reduce((a, b) => a + b, 0) / 30;
            let acczMean = this.packets
                .accelz(0)
                .slice(0, 30)
                .reduce((a, b) => a + b, 0) / 30;
            let norm = Math.sqrt(Math.pow(accxMean, 2) + Math.pow(accyMean, 2) + Math.pow(acczMean, 2));
            this.q_u_world = new three_1.Vector3((-1 * accxMean) / norm, (-1 * accyMean) / norm, (-1 * acczMean) / norm);
        }
        const dt = 1 / this.repCounterConstants.windowWidth;
        const alpha = 0.97;
        for (let i = 0; i < this.packets.getLength() - this.last_len; i++) {
            let w = [
                this.packets.gyrox(this.last_len)[i] * this.GYRO_CONVERSION_RATIO,
                this.packets.gyroy(this.last_len)[i] * this.GYRO_CONVERSION_RATIO,
                this.packets.gyroz(this.last_len)[i] * this.GYRO_CONVERSION_RATIO,
            ];
            let w_norm = Math.sqrt(Math.pow(w[0], 2) + Math.pow(w[1], 2) + Math.pow(w[2], 2));
            let teta = dt * w_norm;
            let q_delta = new three_1.Quaternion((Math.sin(teta / 2) * w[0]) / w_norm, (Math.sin(teta / 2) * w[1]) / w_norm, (Math.sin(teta / 2) * w[2]) / w_norm, Math.cos(teta / 2));
            let q_t_dt = this.q_c.multiply(q_delta);
            let acc = [
                this.packets.accelx(this.last_len)[i] * this.ACC_CONVERSION_RATIO,
                this.packets.accely(this.last_len)[i] * this.ACC_CONVERSION_RATIO,
                this.packets.accelz(this.last_len)[i] * this.ACC_CONVERSION_RATIO,
            ];
            let acc_norm = Math.sqrt(Math.pow(acc[0], 2) + Math.pow(acc[1], 2) + Math.pow(acc[2], 2));
            var q_a = new three_1.Vector3(acc[0] / acc_norm, acc[1] / acc_norm, acc[2] / acc_norm);
            q_a.applyQuaternion(q_t_dt);
            let q_a_world = q_a;
            let q_a_world_norm = Math.sqrt(Math.pow(q_a_world.x, 2) + Math.pow(q_a_world.y, 2) + Math.pow(q_a_world.z, 2));
            let v_x = q_a_world.x / q_a_world_norm;
            let v_y = q_a_world.y / q_a_world_norm;
            let v_z = q_a_world.z / q_a_world_norm;
            let n_norm = Math.sqrt(Math.pow(v_z, 2) + Math.pow(v_x, 2));
            let ang = (1 - alpha) * Math.acos(v_y);
            this.q_c = new three_1.Quaternion((Math.sin(ang / 2) * -v_z) / n_norm, 0, (Math.sin(ang / 2) * v_x) / n_norm, Math.cos(ang / 2)).multiply(q_t_dt);
            let temp = new three_1.Vector3(this.q_u_world.x, this.q_u_world.y, this.q_u_world.z);
            let q_u = temp.applyQuaternion(this.q_c);
            angles.push(Math.round((q_u.angleTo(this.q_base) * 180) / Math.PI));
            if (i + this.last_len == this.DEFAULT_FREQUENCY * 2) {
                let h = temp.applyQuaternion(this.q_c);
                this.q_base = new three_1.Vector3(h.x, h.y, h.z);
            }
        }
        this.last_len = this.packets.getLength();
        return angles;
    }
}
exports.ActivityDetection = ActivityDetection;
