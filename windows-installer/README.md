# FranCee Hostel for Windows

`FranCeeHostelSetup.exe` installs FranCee Hostel for the current Windows user, adding desktop and Start menu shortcuts. It does not need administrator permission. When Microsoft Edge is installed, the shortcuts open FranCee Hostel in an Edge app window; otherwise, they open the hosted site in the default browser.

The app loads the public HTTPS site, so Supabase sign-in, availability, and submissions need internet access. This package does not contain hostel records, passwords, or Supabase secrets.

## Build

On Windows, run from PowerShell:

```powershell
.\windows-installer\Build-WindowsInstaller.ps1
```

This uses the Windows .NET Framework C# compiler and writes the installer to `windows-installer\FranCeeHostelSetup.exe`.

The generated executable is unsigned. Windows SmartScreen may show a warning, and managed devices with strict application-control policies may block it. For public distribution, have the publisher sign the setup executable with a trusted code-signing certificate; do not distribute a private signing key.

To remove the app, use **Uninstall FranCee Hostel** in the Start menu. This removes its shortcuts and per-user app files; it does not affect the website or Supabase data.
