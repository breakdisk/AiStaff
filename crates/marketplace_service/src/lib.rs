//! marketplace_service library target — exposes internal modules for integration tests.
//!
//! Only the escrow_consumer module is exposed; all other modules (handlers,
//! enterprise_handlers, …) remain binary-only via main.rs module declarations.
pub mod escrow_consumer;
