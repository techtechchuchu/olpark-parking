using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;

// 메뉴 "올팍 3D" 또는 명령줄에서 장면 생성과 WebGL 빌드를 실행한다.
// 명령줄: Unity.exe -batchmode -quit -buildTarget WebGL -projectPath <경로> -executeMethod BuildTools.BuildWebGL
public static class BuildTools
{
    const string ScenePath = "Assets/Scenes/Park.unity";

    [MenuItem("올팍 3D/장면 만들기")]
    public static void CreateScene()
    {
        // 코드로 만드는 메쉬들이 쓸 재질. 에셋으로 두어야 빌드에 셰이더가 포함된다
        Directory.CreateDirectory("Assets/Resources");
        if (!File.Exists("Assets/Resources/Base.mat"))
        {
            AssetDatabase.CreateAsset(new Material(Shader.Find("Standard")), "Assets/Resources/Base.mat");
            AssetDatabase.SaveAssets();
        }

        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        new GameObject("Park").AddComponent<ParkScene>(); // 웹에서 SendMessage("Park", ...) 로 부르는 이름
        Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, ScenePath);
        EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        AssetDatabase.SaveAssets();
    }

    [MenuItem("올팍 3D/브라우저용(WebGL) 빌드")]
    public static void BuildWebGL()
    {
        // 장면은 빌드할 때마다 새로 만든다. 저장돼 있던 장면은 스크립트가 다시 컴파일되거나
        // 프로젝트 폴더가 옮겨지면 스크립트 연결이 끊긴 채("missing script")로 빌드될 수 있다.
        CreateScene();
        PlayerSettings.productName = "OlparkParking3D";
        PlayerSettings.companyName = "OlparkTeam";
        PlayerSettings.runInBackground = true;
        // 압축을 끄면 어떤 정적 호스팅에서도 별도 설정 없이 열린다 (전송 압축은 호스팅이 처리)
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.decompressionFallback = false;

        var options = new BuildPlayerOptions
        {
            scenes = new[] { ScenePath },
            locationPathName = "Build/WebGL",
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        };
        BuildReport report = BuildPipeline.BuildPlayer(options);
        Debug.Log("BUILD RESULT: " + report.summary.result + " errors=" + report.summary.totalErrors);
        if (Application.isBatchMode && report.summary.result != BuildResult.Succeeded) EditorApplication.Exit(1);
    }
}
