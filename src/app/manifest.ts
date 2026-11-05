import type { MetadataRoute } from 'next';

/** 폰에서 "홈 화면에 추가"하면 앱처럼 전체화면·가로로 열린다 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'IRON FIST',
    short_name: 'IRON FIST',
    description: '웹 3D 격투 RPG',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#0b0d17',
    theme_color: '#0b0d17',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
