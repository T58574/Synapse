fn main() {
    slint_build::compile("ui/main.slint").expect("Failed to compile Slint UI");
    println!("cargo:rerun-if-changed=ui/");
}
