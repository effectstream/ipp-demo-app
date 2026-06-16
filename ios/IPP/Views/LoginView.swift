import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.ippScreen, Color.ippTint],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 20) {
                Spacer()

                VStack(spacing: 26) {
                    VStack(spacing: 12) {
                        IPPMark(size: 60, shadow: true)
                        VStack(spacing: 5) {
                            Text("IPP")
                                .font(.system(size: 32, weight: .bold))
                                .kerning(-0.5)
                                .foregroundStyle(Color.ippInk)
                            Text("Pacientes - registro y planificación")
                                .font(.subheadline)
                                .foregroundStyle(Color.ippBody)
                        }
                    }

                    VStack(spacing: 14) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Usuario").font(.caption).foregroundStyle(Color.ippBody)
                            TextField("user01", text: $username)
                                .textFieldStyle(.roundedBorder)
                                .autocorrectionDisabled(true)
                                .textInputAutocapitalization(.never)
                                .submitLabel(.next)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Contraseña").font(.caption).foregroundStyle(Color.ippBody)
                            SecureField("pass01", text: $password)
                                .textFieldStyle(.roundedBorder)
                                .submitLabel(.go)
                                .onSubmit(submit)
                        }
                        Button(action: submit) {
                            Text("Ingresar")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .frame(height: 48)
                                .background(Color.ippTeal)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 13))
                                .shadow(color: Color.ippTeal.opacity(0.5), radius: 8, y: 4)
                        }
                        if let error {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(.red)
                        }
                    }

                    HStack(spacing: 8) {
                        CardanoMark()
                        Text("Tu usuario y contraseña crearán una cuenta Cardano")
                            .font(.caption2)
                            .foregroundStyle(Color.ippMuted)
                    }

                    Divider().overlay(Color.ippBorder)

                    Button {
                        env.session.enterAsViewer()
                    } label: {
                        Text("Entrar como visitante")
                            .font(.callout.weight(.medium))
                            .foregroundStyle(Color.ippInk)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .overlay(
                                RoundedRectangle(cornerRadius: 13)
                                    .stroke(Color.ippBorder, lineWidth: 1.5)
                            )
                    }
                    .buttonStyle(.plain)

                    Text("Cuentas de demo: user01…user10 con contraseñas pass01…pass10.")
                        .font(.caption2)
                        .foregroundStyle(Color.ippMuted)
                        .multilineTextAlignment(.center)
                }
                .padding(26)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(Color.ippBorder, lineWidth: 1)
                )
                .shadow(color: Color.ippTealDeep.opacity(0.08), radius: 20, x: 0, y: 8)
                .padding(.horizontal, 24)

                Spacer()
            }
        }
    }

    private func submit() {
        let ok = env.session.loginWithCredentials(username: username, password: password)
        if !ok {
            error = "Usuario o contraseña incorrectos."
        }
    }
}

/// Tiny Cardano-styled disc with the ada glyph — tinted to the teal system.
struct CardanoMark: View {
    var size: CGFloat = 16

    var body: some View {
        ZStack {
            Circle().fill(Color.ippTint)
            Text("₳")
                .font(.system(size: size * 0.62, weight: .bold))
                .foregroundStyle(Color.ippTeal)
                .offset(y: -size * 0.02)
        }
        .frame(width: size, height: size)
    }
}
