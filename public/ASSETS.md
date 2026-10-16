# Bundled assets

- `images/openweb-linux.svg` is the original OpenWeb Linux project logo and browser-tab icon.
- `vendor/v86/libv86.js` and `vendor/v86/v86.wasm` are the official v86 `latest` release from https://github.com/copy/v86/releases/tag/latest (BSD-2-Clause; see `vendor/v86/LICENSE`).
- `vendor/v86/bios/seabios.bin` and `vendor/v86/bios/vgabios.bin` are from v86 commit `94faf3d6b19ecabc53a4010aaa24252fa6a162e2`; the BIOS files carry their upstream license in `vendor/v86/bios/COPYING.LESSER`.
- `images/alpine-virt-3.24.2-x86.iso` is the official Alpine Linux x86 virtual-machine ISO used by the current browser VM flow. It comes from the Alpine release mirror at https://dl-cdn.alpinelinux.org/alpine/latest-stable/releases/x86/alpine-virt-3.24.2-x86.iso.
- `images/debian-mini.iso` remains in the repository as a historical legacy artifact from the earlier Debian-based prototype; it is not used by the active `v86-config.js` boot configuration.

SHA-256:

| File | SHA-256 |
| --- | --- |
| `vendor/v86/libv86.js` | `1b41074f7a5604f528dac6842baf7afccd79d7370b97ea3241944c275b67bec1` |
| `vendor/v86/v86.wasm` | `2fc5609ae837fcbc77147155de6f1014677ecab5369f5584ebc670e9d56e6510` |
| `vendor/v86/bios/seabios.bin` | `73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98` |
| `vendor/v86/bios/vgabios.bin` | `a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880` |
| `images/alpine-virt-3.24.2-x86.iso` | `62e752e0f674b1537a7fc38d9c3e6eab9644ae93e8610efb64756a00e7592a10` |
| `images/debian-mini.iso` | `bf88b571a6264e1e03aa12d9ca1ac1a0168186f6e6962fd1046de1ec11c734ac` |
