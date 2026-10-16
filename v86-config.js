export function createV86Config(screenContainer) {
  return {
    wasm_path: "./public/vendor/v86/v86.wasm",
    memory_size: 512 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    screen_container: screenContainer,
    bios: {
      url: "./public/vendor/v86/bios/seabios.bin",
    },
    vga_bios: {
      url: "./public/vendor/v86/bios/vgabios.bin",
    },
    cdrom: {
      url: "./public/images/debian-mini.iso",
    },
    boot_order: 0x213,
    hda: {
      buffer: new ArrayBuffer(1024 * 1024 * 1024),
    },
    network_relay_url: "wss://relay.widgetry.org/",
    autostart: true,
  };
}
