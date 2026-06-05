import Foundation

// Mirror of ios/IPP/Models/{Patient,ResponseValue}.swift (Codable-relevant parts)
// and ios/IPP/Services/Hasher.swift's encoder config, to produce an authoritative
// canonical-JSON reference for cross-checking the backend TS canonicalizer.

enum ResponseValue: Codable {
    case text(String)
    case number(Double)
    case bool(Bool)
    case strings([String])
    case address(AddressValue)
    case null

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .text(let s):    try c.encode(s)
        case .number(let n):  try c.encode(n)
        case .bool(let b):    try c.encode(b)
        case .strings(let a): try c.encode(a)
        case .address(let a): try c.encode(a)
        case .null:           try c.encodeNil()
        }
    }
    init(from decoder: Decoder) throws { self = .null } // unused here
}

struct AddressValue: Codable {
    var text: String
    var latitud: Double?
    var longitud: Double?
}

struct Patient: Codable {
    var id: String
    var responses: [String: ResponseValue]
    var createdAt: Date
    var updatedAt: Date
    var passcode: String? = nil
}

let fixed = Date(timeIntervalSince1970: 1_780_000_000) // deterministic
let p = Patient(
    id: "3f2a1c9e-0000-4abc-8def-000000000001",
    responses: [
        "nombres": .text("José/María"),       // tests "/" + non-ASCII
        "rut": .text("12.345.678-9"),
        "edad": .number(45),                   // whole number
        "peso": .number(70.5),                 // decimal
        "fuma": .bool(false),
        "sintomas": .strings(["dolor", "ardor"]),
        "vacia": .null,
        "direccion": .address(AddressValue(text: "Av. Siempre Viva 742", latitud: -33.04, longitud: -71.61))
    ],
    createdAt: fixed,
    updatedAt: fixed
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
encoder.dateEncodingStrategy = .iso8601

let json = try encoder.encode(p) // synthesized encode of canonicalCopy()-equivalent (passcode nil)
FileHandle.standardOutput.write(json)
