// 二维码：服务端生成 SVG 内联进页面。
//
// 用纯 JS 的 qrcode-generator，不调任何第三方生码接口 —— 那等于把门票令牌和
// 渠道链接送到别人服务器上。SVG 内联还有两个好处：不多一次请求，且微信里
// 长按能识别/保存。
import qrcode from 'qrcode-generator';

export function qrSvg(content: string, options: { cellSize?: number; margin?: number } = {}): string {
  const qr = qrcode(0, 'M');
  qr.addData(content, 'Byte');
  qr.make();
  return qr.createSvgTag({
    cellSize: options.cellSize ?? 4,
    margin: options.margin ?? 2,
    scalable: true,
  });
}
