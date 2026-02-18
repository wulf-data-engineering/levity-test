use prost::Message;
use prost_types::FileDescriptorSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Path to your proto files root
    let proto_root = Path::new("../protocols");

    // Recursively collect all .proto files
    let mut protos: Vec<PathBuf> = Vec::new();
    find_protos(proto_root, &mut protos)?;

    if protos.is_empty() {
        panic!("No .proto files found in {}", proto_root.display());
    }

    // Tell cargo to re-run this script if any proto file changes
    println!("cargo:rerun-if-changed={}", proto_root.display());
    for proto in &protos {
        println!("cargo:rerun-if-changed={}", proto.display());
    }

    // Path to write temporary descriptor set
    let out_dir = PathBuf::from(env::var("OUT_DIR")?);
    let descriptor_path = out_dir.join("protos_descriptor.bin");

    // Run protoc to generate descriptor set
    // Note: We keep -I as the proto_root so imports work relative to the base directory
    let mut cmd = Command::new("protoc");
    cmd.arg(format!("-I{}", proto_root.display()));
    cmd.arg(format!(
        "--descriptor_set_out={}",
        descriptor_path.display()
    ));
    cmd.arg("--include_imports");

    for p in &protos {
        cmd.arg(p);
    }

    let status = cmd.status()?;
    if !status.success() {
        panic!("protoc failed to generate descriptor set");
    }

    // Read descriptor and decode
    let desc_bytes = fs::read(&descriptor_path)?;
    let fds = FileDescriptorSet::decode(&*desc_bytes)?;

    // Recursively collect fully qualified message names
    fn collect_messages(
        package: &str,
        prefix: &str,
        messages: &[prost_types::DescriptorProto],
        out: &mut Vec<String>,
    ) {
        for msg in messages {
            let name = if prefix.is_empty() {
                format!("{}.{}", package, msg.name.as_deref().unwrap_or_default())
            } else {
                format!(
                    "{}.{}.{}",
                    package,
                    prefix,
                    msg.name.as_deref().unwrap_or_default()
                )
            };
            out.push(name.clone());

            if !msg.nested_type.is_empty() {
                let new_prefix = if prefix.is_empty() {
                    msg.name.as_deref().unwrap_or_default().to_string()
                } else {
                    format!("{}.{}", prefix, msg.name.as_deref().unwrap_or_default())
                };
                collect_messages(package, &new_prefix, &msg.nested_type, out);
            }
        }
    }

    let mut all_message_names = Vec::new();
    for file in fds.file {
        let pkg = file.package.unwrap_or_default();
        collect_messages(&pkg, "", &file.message_type, &mut all_message_names);
    }

    // Configure prost-build
    let mut config = prost_build::Config::new();
    let derive_attr =
        r#"#[derive(serde::Serialize, serde::Deserialize)] #[serde(rename_all = "camelCase")]"#;

    for full_name in &all_message_names {
        config.type_attribute(full_name, derive_attr);
    }

    // Compile protos
    let proto_strs: Vec<&str> = protos.iter().map(|p| p.to_str().unwrap()).collect();
    // We pass the proto_root as the include path here as well
    config.compile_protos(&proto_strs, &[proto_root.to_str().unwrap()])?;

    Ok(())
}

// Recursive helper to find all .proto files
fn find_protos(dir: &Path, protos: &mut Vec<PathBuf>) -> std::io::Result<()> {
    if dir.is_dir() {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                find_protos(&path, protos)?;
            } else if path.extension().map(|e| e == "proto").unwrap_or(false) {
                protos.push(path);
            }
        }
    }
    Ok(())
}
