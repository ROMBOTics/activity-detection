export const REP_COUNTER_DEFAULT_PEAK_PROMINENCE_FACTOR = 0.4;
export const REP_COUNTER_DEFAULT_WINDOW_WIDTH = 70;
export const GLOBAL_DEFAULT_PACKET_SAMPLE_RATE = 2;
export const MIN_EXTECTED_PEAK_PROMINENCE = 600;
export const DEFAULT_EMA_FACTOR = 0.01;
export const MIN_ACF_COEFF = 0.5;
export const GYRO_CONVERSION_RATIO = (2000 * Math.PI) / (32768 * 180);
export const ACC_CONVERSION_RATIO = (2 * 9.81) / 32768;
export const DEFAULT_FREQUENCY = 90;
export const REST = 0;
export const PLANK = 1;
export const RANDOM_MOVEMENT = 2;
export const REST_MAXIMUM_STD = 0.2;
export const PLANK_MAXIMUM_STD = 2;
export const REATIN_WINDOWS = 10;
export const FLUSH_SIZE = 2000;
export const HEIGHT_DEFAULT = '5,5';
export const WALKING_FREQUENCY_LEAST_THRESHOLD = 0.8;
export const RUNNING_FREQUENCY_LEAST_THRESHOLD = 1.2;


// MET levels of different activities
// source: https://www.hss.edu/conditions_burning-calories-with-exercise-calculating-estimated-energy-expenditure.asp
   
export const ACTIVITY_SPEED_2_MET:{ [key:string] : { [key:string] : number;}}= {
    'Walking':      {2: 2.5, 2.5: 3, 3: 3.5, 3.5: 4, 4.5: 4.5},
    'Running':      {5: 8, 5.2: 9, 6: 10, 6.7: 11, 7: 11.5, 7.5: 12.5, 8: 13.5, 8.6: 14, 9: 15, 10: 16, 10.9: 18},
    'Sitting':      {0: 1},
    'Inactivity':   {0: 1.2},
    'Bicycling':    {10: 4, 12: 6, 14: 8, 16: 10, 19: 12}
};
// var persons: { [id: string] : IPerson; } = {};
export const HEIGHT_2_STEPS_PER_MILE: { [key:string] : number;}= {
    '4,6': 2845,
    '4,7': 2800,
    '4,8': 2745,
    '4,9': 2700,
    '4,10': 2645,
    '4,11': 2600,
    '5': 2556,
    '5,1': 2514,
    '5,2': 2474,
    '5,3': 2435,
    '5,4': 2397,
    '5,5': 2360,
    '5,6': 2324,
    '5,7': 2289,
    '5,8': 2256,
    '5,9': 2223,
    '5,10': 2191,
    '5,11': 2160,
    '6': 2130,
    '6,1': 2101,
    '6,2': 2073,
    '6,3': 2045,
    '6,4': 2018,
    '6,5': 1992

};
