import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var username = ""
    @State private var password = ""
    @State private var error: String?

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(.systemBackground), Color.indigo.opacity(0.08)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 20) {
                Spacer()

                VStack(spacing: 28) {
                    VStack(spacing: 6) {
                        Text("IPP")
                            .font(.system(size: 42, weight: .bold))
                            .kerning(-0.5)
                        Text("Pacientes — registro y planificación")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    VStack(spacing: 14) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Usuario").font(.caption).foregroundStyle(.secondary)
                            TextField("user01", text: $username)
                                .textFieldStyle(.roundedBorder)
                                .autocorrectionDisabled(true)
                                .textInputAutocapitalization(.never)
                                .submitLabel(.next)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Contraseña").font(.caption).foregroundStyle(.secondary)
                            SecureField("pass01", text: $password)
                                .textFieldStyle(.roundedBorder)
                                .submitLabel(.go)
                                .onSubmit(submit)
                        }
                        Button(action: submit) {
                            Text("Ingresar")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .frame(height: 46)
                                .background(Color.accentColor)
                                .foregroundStyle(.white)
                                .clipShape(RoundedRectangle(cornerRadius: 10))
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
                            .foregroundStyle(.secondary)
                    }

                    Divider()

                    Button {
                        env.session.enterAsViewer()
                    } label: {
                        Text("Entrar como visitante")
                            .font(.callout.weight(.medium))
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(Color.secondary.opacity(0.35), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)

                    Text("Cuentas de demo: user01…user10 con contraseñas pass01…pass10.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                }
                .padding(24)
                .background(.regularMaterial)
                .clipShape(RoundedRectangle(cornerRadius: 18))
                .shadow(color: .black.opacity(0.06), radius: 16, x: 0, y: 6)
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

/// Tiny Cardano-styled disc with the ada glyph.
struct CardanoMark: View {
    var size: CGFloat = 16

    var body: some View {
        ZStack {
            Circle().fill(Color(red: 0.0, green: 0.2, blue: 0.68))
            Text("₳")
                .font(.system(size: size * 0.7, weight: .bold))
                .foregroundStyle(.white)
                .offset(y: -size * 0.02)
        }
        .frame(width: size, height: size)
    }
}
