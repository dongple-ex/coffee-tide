using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace CoffeeTide {
    // No keystrokes leave this process. Only a completed gesture is published.
    public sealed class LeftShiftGesture {
        readonly HashSet<int> pressed = new HashSet<int>();
        long started = -1, previousRelease = -1;
        public void Seed(int key) { pressed.Add(key); }
        public bool Feed(int key, bool down, long now, bool injected) {
            bool repeated = down && pressed.Contains(key);
            if (down) pressed.Add(key); else pressed.Remove(key);
            if (injected || key != 0xA0) {
                started = previousRelease = -1;
                return false;
            }
            if (down) {
                if (repeated || pressed.Count != 1) {
                    started = previousRelease = -1;
                } else { started = now; }
                return false;
            }
            bool tap = started >= 0 && now - started <= 250 && pressed.Count == 0;
            started = -1;
            if (!tap) { previousRelease = -1; return false; }
            long gap = now - previousRelease;
            if (previousRelease >= 0 && gap >= 70 && gap <= 500) {
                previousRelease = -1;
                return true;
            }
            previousRelease = now;
            return false;
        }
    }

    public static class LeftShiftHook {
        delegate IntPtr HookProc(int code, IntPtr message, IntPtr data);
        [StructLayout(LayoutKind.Sequential)] struct KeyboardData {
            public uint key, scan, flags, time;
            public UIntPtr extra;
        }
        [StructLayout(LayoutKind.Sequential)] struct Message {
            public IntPtr hwnd; public uint message; public UIntPtr wParam;
            public IntPtr lParam; public uint time; public int x, y; public uint privateData;
        }
        [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int id, HookProc callback, IntPtr module, uint thread);
        [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll", SetLastError = true)] static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
        [DllImport("user32.dll")] static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
        [DllImport("user32.dll")] static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
        [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

        public static void Run() {
            var gesture = new LeftShiftGesture();
            // Exclude generic modifiers: hook events use the left/right virtual keys.
            for (int key = 8; key < 255; key++)
                if (key != 0x10 && key != 0x11 && key != 0x12 && (GetAsyncKeyState(key) & 0x8000) != 0) gesture.Seed(key);
            var clock = Stopwatch.StartNew();
            uint thread = GetCurrentThreadId();
            Message message;
            PeekMessage(out message, IntPtr.Zero, 0, 0, 0);
            HookProc callback = delegate(int code, IntPtr msg, IntPtr data) {
                if (code >= 0) {
                    int kind = msg.ToInt32();
                    if (kind == 0x100 || kind == 0x104 || kind == 0x101 || kind == 0x105) {
                        var key = (KeyboardData)Marshal.PtrToStructure(data, typeof(KeyboardData));
                        if (gesture.Feed((int)key.key, kind == 0x100 || kind == 0x104, clock.ElapsedMilliseconds, (key.flags & 0x10) != 0))
                            PostThreadMessage(thread, 0x8001, UIntPtr.Zero, IntPtr.Zero);
                    }
                }
                // Preserve normal typing and all other applications' shortcuts.
                return CallNextHookEx(IntPtr.Zero, code, msg, data);
            };
            IntPtr hook = SetWindowsHookEx(13, callback, GetModuleHandle(null), 0);
            if (hook == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            try {
                // The parent owns stdin. EOF also cleans up after a parent crash.
                var input = new Thread(delegate() {
                    while (Console.ReadLine() != null) { }
                    PostThreadMessage(thread, 0x12, UIntPtr.Zero, IntPtr.Zero);
                });
                input.IsBackground = true;
                input.Start();
                Console.WriteLine("ready");
                int result;
                while ((result = GetMessage(out message, IntPtr.Zero, 0, 0)) > 0)
                    if (message.message == 0x8001) Console.WriteLine("left-shift-double-tap");
                if (result < 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            } finally {
                UnhookWindowsHookEx(hook);
                GC.KeepAlive(callback);
            }
        }
    }
}
