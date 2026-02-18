use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, LitStr};

///
/// This macro supports loading a package of protocols into the scope of a Rust file.
///
/// Usage:
///
/// ```
/// #[protocols("some_package")]
/// pub mod protocols {}
///
/// async fn handler(req: Request) -> Result<Response<Body>, Error> {
///     let response = SomeProtocolStruct {
///        some_field_defined_in_protocol_buffers: 42
///     }
//     write_response(&response, &req)
// }
///
/// ```
///
#[proc_macro_attribute]
pub fn protocols(attr: TokenStream, item: TokenStream) -> TokenStream {
    let proto_package = parse_macro_input!(attr as LitStr);
    let proto_package_str = proto_package.value();

    // Parse the mod item
    let module = parse_macro_input!(item as syn::ItemMod);
    let mod_ident = &module.ident;

    let file_path = format!("/{proto_package_str}.rs");

    let expanded = quote! {
        pub mod #mod_ident {
            include!(concat!(env!("OUT_DIR"), #file_path));
        }
        pub use #mod_ident::*;
    };
    expanded.into()
}
