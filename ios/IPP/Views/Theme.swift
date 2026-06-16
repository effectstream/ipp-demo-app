import SwiftUI

// "Clínica · Calm Teal" palette — single teal accent, light-only.
extension Color {
    init(hexRGB: UInt) {
        self.init(
            .sRGB,
            red: Double((hexRGB >> 16) & 0xFF) / 255,
            green: Double((hexRGB >> 8) & 0xFF) / 255,
            blue: Double(hexRGB & 0xFF) / 255,
            opacity: 1
        )
    }

    static let ippTeal = Color(hexRGB: 0x0E726E)      // primary accent
    static let ippTealDeep = Color(hexRGB: 0x0A5450)
    static let ippInk = Color(hexRGB: 0x14201E)        // headings
    static let ippBody = Color(hexRGB: 0x54635F)       // body text
    static let ippMuted = Color(hexRGB: 0x93A3A1)      // labels / tertiary
    static let ippFaint = Color(hexRGB: 0xC0CCCA)      // placeholder
    static let ippTint = Color(hexRGB: 0xE6F2F1)       // chips / icon bg
    static let ippBorder = Color(hexRGB: 0xE3EAE9)
    static let ippDivider = Color(hexRGB: 0xEEF2F1)
    static let ippScreen = Color(hexRGB: 0xF3F6F5)     // screen background
    static let ippGold = Color(hexRGB: 0xB0842F)       // ranking / trophy
    static let ippGoldSoft = Color(hexRGB: 0xF4ECDB)
}

extension LinearGradient {
    // Brand gradient used on the logo squircle and hero cards.
    static let ippBrand = LinearGradient(
        colors: [Color(hexRGB: 0x13837E), Color(hexRGB: 0x0A5450)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

// The IPP women's-health glyph, drawn on the design's 48×48 grid and scaled to
// fill whatever frame it's given.
struct IPPGlyph: View {
    var color: Color = .white

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 48
            ctx.scaleBy(x: s, y: s)
            let stroke = StrokeStyle(lineWidth: 2.7, lineCap: .round)

            var left = Path()
            left.move(to: CGPoint(x: 24, y: 31))
            left.addCurve(to: CGPoint(x: 12.5, y: 17), control1: CGPoint(x: 24, y: 23), control2: CGPoint(x: 18, y: 21))
            ctx.stroke(left, with: .color(color), style: stroke)

            var right = Path()
            right.move(to: CGPoint(x: 24, y: 31))
            right.addCurve(to: CGPoint(x: 35.5, y: 17), control1: CGPoint(x: 24, y: 23), control2: CGPoint(x: 30, y: 21))
            ctx.stroke(right, with: .color(color), style: stroke)

            bud(&ctx, cx: 10.6, cy: 15.4, deg: -32)
            bud(&ctx, cx: 37.4, cy: 15.4, deg: 32)

            var body = Path()
            body.move(to: CGPoint(x: 24, y: 30.5))
            body.addCurve(to: CGPoint(x: 20.8, y: 38), control1: CGPoint(x: 19.6, y: 30.5), control2: CGPoint(x: 18.6, y: 35))
            body.addCurve(to: CGPoint(x: 27.2, y: 38), control1: CGPoint(x: 22.4, y: 40.2), control2: CGPoint(x: 25.6, y: 40.2))
            body.addCurve(to: CGPoint(x: 24, y: 30.5), control1: CGPoint(x: 29.4, y: 35), control2: CGPoint(x: 28.4, y: 30.5))
            body.closeSubpath()
            ctx.fill(body, with: .color(color))
        }
    }

    private func bud(_ ctx: inout GraphicsContext, cx: CGFloat, cy: CGFloat, deg: CGFloat) {
        ctx.drawLayer { layer in
            layer.translateBy(x: cx, y: cy)
            layer.rotate(by: .degrees(deg))
            layer.fill(Path(ellipseIn: CGRect(x: -3.2, y: -2.4, width: 6.4, height: 4.8)), with: .color(color))
        }
    }
}

// IPP brand mark — squircle + glyph.
struct IPPMark: View {
    enum Variant { case gradient, tint, dark }
    var size: CGFloat = 32
    var variant: Variant = .gradient
    var shadow: Bool = false

    var body: some View {
        let glyph: Color = variant == .tint ? .ippTeal : .white
        RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            .fill(background)
            .frame(width: size, height: size)
            .overlay(IPPGlyph(color: glyph).frame(width: size * 0.6, height: size * 0.6))
            .shadow(color: shadow ? Color.ippTealDeep.opacity(0.45) : .clear,
                    radius: shadow ? size * 0.18 : 0, y: shadow ? size * 0.12 : 0)
    }

    private var background: AnyShapeStyle {
        switch variant {
        case .gradient: return AnyShapeStyle(LinearGradient.ippBrand)
        case .tint: return AnyShapeStyle(Color.ippTint)
        case .dark: return AnyShapeStyle(Color.ippInk)
        }
    }
}
