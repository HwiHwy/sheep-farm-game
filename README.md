# Nông Trại Cừu 3D — V11 Nature + Audio

Project Three.js + Vite. This version expands the circular island with a nature border inspired by Quaternius' **Ultimate Stylized Nature Pack**: mixed trees, regular bushes, flowering bushes, grass tufts, rocks, and a small woodland pond. All decoration is kept outside the sheep's roaming area and clear of the front gate / holding-pen route.

## 1. Character models

Place the two character files here:

```text
public/models/
├── sheep.glb
└── wolf.glb
```

Use self-contained `.glb` files (textures embedded in the GLB). The loader automatically scales the models and places their feet on the ground. If a character model is missing, the game uses its built-in placeholder model.

## 2. Quaternius nature assets (optional local copy)

The game tries to load these Nature Pack files from:

```text
public/models/nature/glTF/
```

Files used by the scene:

```text
BirchTree_1.gltf
BirchTree_3.gltf
MapleTree_1.gltf
MapleTree_3.gltf
Bush.gltf
Bush_Large.gltf
Bush_Flowers.gltf
Bush_Large_Flowers.gltf
```

Download the **GLTF** version of the pack, then copy the full `glTF` folder and any companion `.bin` / texture folders into `public/models/nature/`. Preserve the original folder structure so relative texture and buffer paths continue to work.

The code also attempts to load the same model filenames from a public mirror. If neither the local files nor the online files are available, the game automatically keeps its procedural nature decorations, so the project still runs.

**Pack source:** https://poly.pizza/bundle/Ultimate-Stylized-Nature-Pack-zyIyYd9yGr  
**Creator:** Quaternius  
**License:** CC0 / Public Domain. The pack page describes 60+ nature assets in FBX and GLB/glTF formats for personal and commercial projects.

## 3. Run on Windows

Open this folder in VS Code and run:

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173/`.

Build the production site with:

```powershell
npm.cmd run build
```

The output is created in `dist/`.

## 4. Included gameplay

- Participant names become individual sheep.
- Sheep receive random coat colours and wander around the circular paddock.
- The wolf waits at the front gate until the release button is pressed.
- Each release randomly selects one remaining sheep.
- The wolf enters, chases the selected sheep, carries it out, and places it in the holding pen.
- A dismissible caught-player popup appears only after a sheep is caught.
- The camera can orbit around the farm and zoom.
- The bottom-centred control panel works on desktop and mobile.

## 5. V10 environment update

- Added a mixed tree line around the outer rim of the circular island.
- Added regular and flowering bushes around the perimeter.
- Added a woodland pond with rocks and lily leaves.
- Added more natural grass tufts and ground details.
- Kept the main gate, curved path, wolf route, holding pen, and sheep roaming zone unobstructed.


## 6. Âm thanh và nhạc nền

Mở `src/main.js` và tìm `AUDIO_CONFIG` ở gần đầu file. Các URL đang để trống để bạn tự thêm:

```js
const AUDIO_CONFIG = {
  backgroundMusicUrl: '', // '/audio/farm-background.mp3'
  backgroundMusicVolume: 0.22,
  sheepBleatUrls: [
    // '/audio/sheep-bleat-1.mp3',
    // '/audio/sheep-bleat-2.mp3'
  ],
  sheepBleatVolume: 0.28,
  sheepBleatMinIntervalMs: 26000,
  sheepBleatMaxIntervalMs: 42000,
  buttonClickUrl: '', // '/audio/button-click.mp3'
  buttonClickVolume: 0.32,
  popupSoundUrl: '', // '/audio/popup-chime.mp3'
  popupSoundVolume: 0.55
};
```

Đặt file âm thanh trong `public/audio/`. Ví dụ file `public/audio/farm-background.mp3` dùng URL `/audio/farm-background.mp3`. Có thể dùng URL âm thanh trực tiếp từ internet. Để trống URL thì âm thanh tương ứng sẽ không dùng file ngoài; hiệu ứng nút và popup có âm báo nhỏ được tạo sẵn bằng Web Audio.

- Nhạc nền chạy lặp và chỉ bắt đầu sau lần tương tác đầu tiên của người dùng (quy định autoplay của trình duyệt).
- Tiếng cừu kêu chỉ phát khi còn cừu trong nông trại, ngẫu nhiên mỗi 26–42 giây theo mặc định. Bạn có thể tăng khoảng thời gian nếu muốn tiếng cừu hiếm hơn.
- Nút `ÂM THANH` trên thanh đầu trang dùng để tắt/bật toàn bộ âm thanh.
- Thay đổi âm lượng bằng các giá trị `...Volume` trong `AUDIO_CONFIG`.
