import { Greeter } from '../index';
test('My Greeter', () => {
  expect(Greeter('Rombot')).toBe('Hello Rombot');
});
