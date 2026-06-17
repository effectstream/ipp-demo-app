import Foundation

// Built-in accounts. Secret keys match web/src/accounts.ts byte-for-byte so the
// derived Cardano address is identical between iOS and the web for the
// same login.
struct Account: Codable, Hashable, Identifiable {
    let username: String
    let password: String
    let secretKey: String

    var id: String { username }
}

enum Accounts {
    static let all: [Account] = [
        Account(username: "user01", password: "pass01", secretKey: "ccc9f28bd0bc571e9e2f94043b7836ee25259d44828d7fb88e2607963952edcb"),
        Account(username: "user02", password: "pass02", secretKey: "7159b3bb29843b62e93eb12b6d5f2933a8c6cb648227231d550aff695851d8c3"),
        Account(username: "user03", password: "pass03", secretKey: "5213fe778936f41818d22484088590f2e5096b5a020049dfb91cbb0af32e3bb3"),
        Account(username: "user04", password: "pass04", secretKey: "6ac2f27e184bbb6bda80e824e9a4a83bb9a870695fccb00f23e40cf7fcde7ff8"),
        Account(username: "user05", password: "pass05", secretKey: "5448cf31d61ecffa7945b5bff00551631ea26cb5611b5ba307a3eb1e8fb7d086"),
        Account(username: "user06", password: "pass06", secretKey: "2fa3f442b1fb97a0d1cdbc2ed5ac171f330c486848e3cb7557e9e3c2066ccbc6"),
        Account(username: "user07", password: "pass07", secretKey: "f9e823d3b6c6d7b1891353b59c0b4b7171b2533e0f32cb0edf0db6cda55ae1c8"),
        Account(username: "user08", password: "pass08", secretKey: "942d21a804841e93b1044e7ae95036bda81021b9cc0aa6bcbc4e87d5d061785a"),
        Account(username: "user09", password: "pass09", secretKey: "6f1f2afaa9734364957e09fc73ef7ee96cacaeee3aca492c51470c355f4a9f8a"),
        Account(username: "user10", password: "pass10", secretKey: "c7eca2c87f21d35d824b7489988095b4ffc67c77ffcb9da8109fde205ff091d2"),
    ]

    static func find(username: String, password: String) -> Account? {
        let u = username.trimmingCharacters(in: .whitespacesAndNewlines)
        return all.first(where: { $0.username == u && $0.password == password })
    }
}

extension Account {
    var walletAddress: String {
        CardanoWallet.deriveAddress(for: "cardano-sk:\(secretKey)")
    }
}
