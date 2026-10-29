fn main() {
    // 1. Compile Slint UI
    slint_build::compile("ui/main.slint").expect("Failed to compile Slint UI");

    // 2. Compile C++ Audio Engine
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .file("cpp/audio_engine.cpp")
        .include("cpp")
        .warnings(false);

    build.compile("synapse_audio");

    // 3. Platform link flags
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    match target_os.as_str() {
        "linux" => {
            println!("cargo:rustc-link-lib=asound");
            println!("cargo:rustc-link-lib=pthread");
            println!("cargo:rustc-link-lib=m");
            println!("cargo:rustc-link-lib=dl");
        }
        "windows" => {
            println!("cargo:rustc-link-lib=ole32");
            println!("cargo:rustc-link-lib=winmm");
        }
        "macos" => {
            println!("cargo:rustc-link-lib=framework=CoreAudio");
            println!("cargo:rustc-link-lib=framework=CoreFoundation");
        }
        _ => {}
    }

    println!("cargo:rerun-if-changed=ui/");
    println!("cargo:rerun-if-changed=cpp/audio_engine.cpp");
    println!("cargo:rerun-if-changed=cpp/audio_engine.h");
}
