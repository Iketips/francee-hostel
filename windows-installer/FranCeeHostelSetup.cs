using System;
using System.IO;
using System.Reflection;
using System.Diagnostics;
using System.Windows.Forms;

internal static class FranCeeHostelSetup
{
	private const string AppUrl = "https://iketips.github.io/francee-hostel/";
	private const string IconResource = "FranCeeHostel.icon-192.png";
	private const string AppFolderName = "FranCee Hostel";

	[STAThread]
	private static void Main(string[] args)
	{
		Application.EnableVisualStyles();
		Application.SetCompatibleTextRenderingDefault(false);

		try
		{
			if (args.Length > 0 && args[0] == "--install")
			{
				Install();
			}
			else if (args.Length > 0 && args[0] == "--uninstall")
			{
				Uninstall();
			}
			else if (args.Length > 0 && args[0] == "--launch")
			{
				LaunchApp();
			}
			else
			{
				Install();
			}
		}
		catch (Exception exception)
		{
			MessageBox.Show(
				"FranCee Hostel could not complete this action.\r\n\r\n" + exception.Message,
				"FranCee Hostel",
				MessageBoxButtons.OK,
				MessageBoxIcon.Error);
		}
	}

	private static string GetInstallDirectory()
	{
		return Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
			"Programs",
			AppFolderName);
	}

	private static void Install()
	{
		string installDirectory = GetInstallDirectory();
		Directory.CreateDirectory(installDirectory);
		string installedExecutable = Path.Combine(installDirectory, "FranCeeHostel.exe");
		string currentExecutable = Assembly.GetExecutingAssembly().Location;
		if (!String.Equals(currentExecutable, installedExecutable, StringComparison.OrdinalIgnoreCase))
		{
			File.Copy(currentExecutable, installedExecutable, true);
		}

		string iconPath = Path.Combine(installDirectory, "FranCeeHostel.ico");
		WriteIcon(iconPath);

		string startMenuDirectory = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.Programs),
			AppFolderName);
		Directory.CreateDirectory(startMenuDirectory);
		CreateShortcut(
			Path.Combine(startMenuDirectory, "FranCee Hostel.lnk"),
			installedExecutable,
			"--launch",
			iconPath);
		CreateShortcut(
			Path.Combine(startMenuDirectory, "Uninstall FranCee Hostel.lnk"),
			installedExecutable,
			"--uninstall",
			iconPath);
		CreateShortcut(
			Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "FranCee Hostel.lnk"),
			installedExecutable,
			"--launch",
			iconPath);

		MessageBox.Show(
			"FranCee Hostel is installed. You can open it from the desktop or Start menu.",
			"FranCee Hostel setup",
			MessageBoxButtons.OK,
			MessageBoxIcon.Information);
	}

	private static void CreateShortcut(string shortcutPath, string targetPath, string arguments, string iconPath)
	{
		Type shellType = Type.GetTypeFromProgID("WScript.Shell");
		if (shellType == null)
		{
			throw new InvalidOperationException("Windows Script Host is unavailable, so shortcuts could not be created.");
		}

		dynamic shell = Activator.CreateInstance(shellType);
		dynamic shortcut = shell.CreateShortcut(shortcutPath);
		shortcut.TargetPath = targetPath;
		shortcut.Arguments = arguments;
		shortcut.WorkingDirectory = Path.GetDirectoryName(targetPath);
		shortcut.IconLocation = iconPath + ",0";
		shortcut.Description = "FranCee Hostel room booking and student portal";
		shortcut.Save();
	}

	private static void WriteIcon(string iconPath)
	{
		Assembly assembly = Assembly.GetExecutingAssembly();
		using (Stream resource = assembly.GetManifestResourceStream(IconResource))
		{
			if (resource == null)
			{
				throw new InvalidOperationException("The app icon is missing from this setup executable.");
			}

			using (MemoryStream png = new MemoryStream())
			{
				resource.CopyTo(png);
				byte[] image = png.ToArray();
				using (FileStream file = File.Create(iconPath))
				using (BinaryWriter writer = new BinaryWriter(file))
				{
					writer.Write((UInt16)0);
					writer.Write((UInt16)1);
					writer.Write((UInt16)1);
					writer.Write((byte)192);
					writer.Write((byte)192);
					writer.Write((byte)0);
					writer.Write((byte)0);
					writer.Write((UInt16)1);
					writer.Write((UInt16)32);
					writer.Write((UInt32)image.Length);
					writer.Write((UInt32)22);
					writer.Write(image);
				}
			}
		}
	}

	private static void LaunchApp()
	{
		string edgeX86 = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
			"Microsoft",
			"Edge",
			"Application",
			"msedge.exe");
		string edgeX64 = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
			"Microsoft",
			"Edge",
			"Application",
			"msedge.exe");
		string edgePath = File.Exists(edgeX86) ? edgeX86 : (File.Exists(edgeX64) ? edgeX64 : null);

		ProcessStartInfo startInfo = edgePath == null
			? new ProcessStartInfo(AppUrl)
			: new ProcessStartInfo(edgePath, "--app=\"" + AppUrl + "\"");
		startInfo.UseShellExecute = true;
		Process.Start(startInfo);
	}

	private static void Uninstall()
	{
		DialogResult answer = MessageBox.Show(
			"Remove FranCee Hostel and its shortcuts from this Windows account?",
			"Uninstall FranCee Hostel",
			MessageBoxButtons.YesNo,
			MessageBoxIcon.Question);
		if (answer != DialogResult.Yes)
		{
			return;
		}

		string startMenuDirectory = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.Programs),
			AppFolderName);
		string desktopShortcut = Path.Combine(
			Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
			"FranCee Hostel.lnk");
		if (Directory.Exists(startMenuDirectory))
		{
			Directory.Delete(startMenuDirectory, true);
		}
		if (File.Exists(desktopShortcut))
		{
			File.Delete(desktopShortcut);
		}

		ProcessStartInfo cleanup = new ProcessStartInfo(
			"cmd.exe",
			"/c ping 127.0.0.1 -n 3 >nul & rmdir /s /q \"%LOCALAPPDATA%\\Programs\\FranCee Hostel\"");
		cleanup.CreateNoWindow = true;
		cleanup.UseShellExecute = false;
		Process.Start(cleanup);
	}
}
