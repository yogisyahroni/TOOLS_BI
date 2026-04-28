import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

export const Updater = () => {
  useEffect(() => {
    const checkUpdate = async () => {
      try {
        const update = await check();
        if (update) {
          console.log(`Update to ${update.version} available!`);
          
          toast.info(`Versi baru ${update.version} tersedia!`, {
            description: "Sedang mengunduh pembaruan...",
            duration: 10000,
          });

          await update.downloadAndInstall();
          
          toast.success("Update berhasil diinstal!", {
            description: "Aplikasi akan dimulai ulang sekarang.",
            action: {
              label: "Restart Sekarang",
              onClick: () => relaunch(),
            },
          });

          // Otomatis restart setelah 3 detik
          setTimeout(async () => {
            await relaunch();
          }, 3000);
        }
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    };

    // Deteksi apakah sedang berjalan di Tauri
    if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
      checkUpdate();
    }
  }, []);

  return null;
};
