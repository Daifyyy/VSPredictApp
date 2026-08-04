import sharp from "sharp";

const source = "public/brand-mark.svg";

await Promise.all([
  sharp(source).resize(192, 192).png().toFile("public/icon-192.png"),
  sharp(source).resize(512, 512).png().toFile("public/icon-512.png"),
  sharp(source).resize(180, 180).png().toFile("public/apple-touch-icon.png"),
  sharp(source).resize(512, 512).png().toFile("public/logoapp.png"),
  sharp({ create: { width: 512, height: 512, channels: 4, background: "#b9ff2c" } })
    .composite([{ input: await sharp(source).resize(360, 360).toBuffer(), gravity: "center" }])
    .png()
    .toFile("public/icon-maskable-512.png"),
]);

console.log("Football Insight icons generated.");
