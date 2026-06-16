import Foundation

// Response of GET /api/v1/field-stats - per-field aggregates for the discreet
// comparison shown under each form field. Mirrors the backend shape.
struct FieldStatsBundle: Decodable {
    let local: ScopeStats?
    let country: ScopeStats
    let world: ScopeStats?
}

struct ScopeStats: Decodable {
    let n: Int?
    let fields: [String: FieldAgg]
}

struct FieldAgg: Decodable {
    let type: String?
    let n: Int?
    let mean: Double?
    let p25: Double?
    let p50: Double?
    let p75: Double?
    let pctTrue: Double?
    let freq: [String: Double]?
}
