fn main() {
    // 1. Compile Slint UI
    slint_build::compile("ui/main.slint").expect("Failed to compile Slint UI");

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();

    // 2. Compile C++ Audio Engine
    let mut build = cc::Build::new();
    build
        .cpp(true)
        .std("c++17")
        .file("cpp/audio_engine.cpp")
        .include("cpp");

    if target_os == "windows" {
        build.define("NOMINMAX", None);
        build.define("WIN32_LEAN_AND_MEAN", None);
        build.define("_CRT_SECURE_NO_WARNINGS", None);
        build.define("_USE_MATH_DEFINES", None);
        build.define("MA_COINIT_VALUE", "2");

        if target_env == "msvc" {
            build.flag("/EHsc");
            build.flag("/utf-8");
            build.flag("/permissive-");
        }
    }

    build.compile("synapse_audio");

    // 3. Platform link flags
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
            println!("cargo:rustc-link-lib=user32");
            println!("cargo:rustc-link-lib=avrt");
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
