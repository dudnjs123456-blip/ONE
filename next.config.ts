import type { NextConfig } from "next";

/** 모델·애니메이션·텍스처는 크고 잘 안 바뀐다 — 브라우저가 하루 동안 다시 받지 않게 하고, 그 뒤엔 뒤에서 새로 확인 */
const ASSET_CACHE = "public, max-age=86400, stale-while-revalidate=604800";

const nextConfig: NextConfig = {
  async headers() {
    return ["/models/:path*", "/anims/:path*", "/textures/:path*"].map((source) => ({
      source,
      headers: [{ key: "Cache-Control", value: ASSET_CACHE }],
    }));
  },
};

export default nextConfig;
