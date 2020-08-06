import { Packet } from '../packet';

test('Basic Packet Test', () => {
  const p = new Packet(1, [1]);
  expect(p.count).toBe(1);
});
