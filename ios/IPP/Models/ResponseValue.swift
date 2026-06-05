import Foundation

// Generic value held by a Patient.responses[questionId]. Modeled as a sum
// type so we can preserve enough type info to render the right SwiftUI
// widget per question.
enum ResponseValue: Codable, Hashable {
    case text(String)
    case number(Double)
    case bool(Bool)
    case strings([String])
    case address(AddressValue)
    case null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
            return
        }
        if let b = try? c.decode(Bool.self) {
            self = .bool(b)
            return
        }
        if let n = try? c.decode(Double.self) {
            self = .number(n)
            return
        }
        if let arr = try? c.decode([String].self) {
            self = .strings(arr)
            return
        }
        if let addr = try? c.decode(AddressValue.self) {
            self = .address(addr)
            return
        }
        if let s = try? c.decode(String.self) {
            self = .text(s)
            return
        }
        self = .null
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .text(let s):     try c.encode(s)
        case .number(let n):   try c.encode(n)
        case .bool(let b):     try c.encode(b)
        case .strings(let a):  try c.encode(a)
        case .address(let a):  try c.encode(a)
        case .null:            try c.encodeNil()
        }
    }
}

struct AddressValue: Codable, Hashable {
    var text: String
    var latitud: Double?
    var longitud: Double?
}

// Convenience accessors used throughout the views.
extension ResponseValue {
    var asText: String? {
        if case .text(let s) = self { return s }
        return nil
    }
    var asNumber: Double? {
        if case .number(let n) = self { return n }
        return nil
    }
    var asInt: Int? {
        if case .number(let n) = self { return Int(n) }
        return nil
    }
    var asBool: Bool? {
        if case .bool(let b) = self { return b }
        return nil
    }
    var asStrings: [String]? {
        if case .strings(let a) = self { return a }
        return nil
    }
    var asAddress: AddressValue? {
        if case .address(let a) = self { return a }
        return nil
    }
    var isNullOrEmpty: Bool {
        switch self {
        case .null: return true
        case .text(let s): return s.isEmpty
        case .strings(let a): return a.isEmpty
        default: return false
        }
    }
}
