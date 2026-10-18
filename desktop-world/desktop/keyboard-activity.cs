using System;
using System.Runtime.InteropServices;
using System.Threading;

// Reports presence of keyboard activity only. The key-data pointer is NEVER
// dereferenced: no key codes, text, window titles or application names are read.
public static class XiyuKeyboardActivity
{
    private delegate IntPtr HookProc(int code, IntPtr message, IntPtr keyData);
    private static readonly HookProc Callback = OnKeyboard;
    private static IntPtr hook;
    private static int active;
    private static uint threadId;

    [StructLayout(LayoutKind.Sequential)]
    private struct Message { public IntPtr hwnd; public uint message; public UIntPtr wParam; public IntPtr lParam; public uint time; public int x, y; public uint extra; }
    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int type, HookProc callback, IntPtr module, uint thread);
    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr handle, int code, IntPtr message, IntPtr data);
    [DllImport("user32.dll")]
    private static extern bool UnhookWindowsHookEx(IntPtr handle);
    [DllImport("user32.dll")]
    private static extern int GetMessage(out Message message, IntPtr window, uint min, uint max);
    [DllImport("user32.dll")]
    private static extern bool PeekMessage(out Message message, IntPtr window, uint min, uint max, uint remove);
    [DllImport("user32.dll")]
    private static extern bool PostThreadMessage(uint thread, uint message, UIntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr GetModuleHandle(string name);
    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    private static IntPtr OnKeyboard(int code, IntPtr message, IntPtr keyData)
    {
        long kind = message.ToInt64();
        if (code >= 0 && (kind == 0x100 || kind == 0x104)) Interlocked.Exchange(ref active, 1);
        // Never swallow or alter input. No I/O or allocation on the hook thread.
        return CallNextHookEx(hook, code, message, keyData);
    }

    public static int Main()
    {
        threadId = GetCurrentThreadId();
        Message message;
        PeekMessage(out message, IntPtr.Zero, 0, 0, 0); // Create the thread queue before stdin can close.
        hook = SetWindowsHookEx(13, Callback, GetModuleHandle(null), 0);
        if (hook == IntPtr.Zero) { Console.WriteLine("{\"type\":\"error\"}"); return 1; }
        Console.WriteLine("{\"type\":\"ready\"}");
        var reader = new Thread(() => {
            // Parent exits/crashes -> pipe closes -> immediately release the hook.
            try { Console.ReadLine(); } catch { }
            PostThreadMessage(threadId, 0x12, UIntPtr.Zero, IntPtr.Zero);
        });
        reader.IsBackground = true;
        reader.Start();
        var writer = new Thread(() => {
            try {
                while (true) {
                    Thread.Sleep(250);
                    if (Interlocked.Exchange(ref active, 0) != 0) Console.WriteLine("{\"type\":\"activity\"}");
                }
            } catch { PostThreadMessage(threadId, 0x12, UIntPtr.Zero, IntPtr.Zero); }
        });
        writer.IsBackground = true;
        writer.Start();
        try { while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { } }
        finally { UnhookWindowsHookEx(hook); }
        return 0;
    }
}
