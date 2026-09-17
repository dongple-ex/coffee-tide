using System;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CoffeeTideMainWindow {
  delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr h, int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  static bool Matches(IntPtr h, string marker) {
    var text = new StringBuilder(2048); GetWindowText(h, text, text.Capacity);
    return text.ToString().Contains("[CoffeeTide:" + marker + "]");
  }
  public static bool Run(string action, string marker) {
    if (!System.Text.RegularExpressions.Regex.IsMatch(marker, "^[a-f0-9]{32}$")) return false;
    var matches = new List<IntPtr>();
    EnumWindows((h, p) => { if (Matches(h, marker)) matches.Add(h); return true; }, IntPtr.Zero);
    if (matches.Count == 0) return false;
    var target = matches[0];
    if (action == "minimize") {
      ShowWindowAsync(target, 6);
      for (int i = 0; i < 30; i++) { if (IsIconic(target)) return true; System.Threading.Thread.Sleep(20); }
      return true;
    }
    if (action == "restore") {
      ShowWindowAsync(target, 9);
      for (int i = 0; i < 30; i++) { if (!IsIconic(target)) { SetForegroundWindow(target); return true; } System.Threading.Thread.Sleep(20); }
      SetForegroundWindow(target);
      return true;
    }
    return false;
  }
}
