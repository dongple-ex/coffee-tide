namespace CoffeeTide {
    public static class GestureTests {
        static int checks;
        static void Expect(bool actual, bool expected) {
            checks++;
            if (actual != expected) throw new System.Exception("Gesture check failed: " + checks);
        }
        static void Tap(LeftShiftGesture g, int key, long time, bool expected) {
            Expect(g.Feed(key, true, time, false), false);
            Expect(g.Feed(key, false, time + 40, false), expected);
        }
        public static void Run() {
            var g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false); Tap(g, 0xA0, 200, true); Tap(g, 0xA0, 400, false);
            g = new LeftShiftGesture();
            Tap(g, 0xA1, 0, false); Tap(g, 0xA1, 200, false);
            g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false); Tap(g, 0xA1, 200, false); Tap(g, 0xA0, 400, false);
            g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false); Tap(g, 0xA0, 501, false);
            g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false); Tap(g, 0xA0, 60, false);
            g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false); Tap(g, 0xA0, 500, true);
            g = new LeftShiftGesture();
            Expect(g.Feed(0xA0, true, 0, false), false);
            Expect(g.Feed(0xA0, false, 251, false), false); Tap(g, 0xA0, 300, false);
            g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false);
            Expect(g.Feed(0xA0, true, 200, false), false);
            Expect(g.Feed(0xA0, true, 220, false), false);
            Expect(g.Feed(0xA0, false, 240, false), false);
            g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false);
            Expect(g.Feed(0xA0, true, 200, false), false);
            Expect(g.Feed(0x41, true, 210, false), false);
            Expect(g.Feed(0x41, false, 220, false), false);
            Expect(g.Feed(0xA0, false, 240, false), false);
            g = new LeftShiftGesture();
            g.Seed(0xA2); // Ctrl already held when the hook starts.
            Tap(g, 0xA0, 0, false); Tap(g, 0xA0, 200, false);
            g = new LeftShiftGesture();
            Expect(g.Feed(0xA0, false, 0, false), false); Tap(g, 0xA0, 200, false);
            g = new LeftShiftGesture();
            Tap(g, 0xA0, 0, false);
            Expect(g.Feed(0xA0, true, 200, true), false);
            Expect(g.Feed(0xA0, false, 240, true), false);
            System.Console.WriteLine("gesture-checks-passed: " + checks);
        }
    }
}
