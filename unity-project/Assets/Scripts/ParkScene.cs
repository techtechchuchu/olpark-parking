using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;
using UnityEngine.Rendering;

// 올림픽공원 3D 지도. 지형·건물·주차장 윤곽은 Resources/park.json (OpenStreetMap 변환 결과)에서 읽어 코드로 만든다.
// 웹페이지가 SendMessage("Park", "SetParking", json) 으로 주차 현황을 넘기면 주차장 색과 차량 수가 바뀐다.
// 이름표는 Unity 안에서 그리지 않고, 화면 좌표만 웹페이지로 보내 웹 글꼴로 선명하게 그린다.
public class ParkScene : MonoBehaviour
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void OlparkLotClicked(string osm);
    [DllImport("__Internal")] static extern void OlparkReady();
    [DllImport("__Internal")] static extern void OlparkLabels(string lines);
#else
    static void OlparkLotClicked(string osm) { Debug.Log("lot clicked " + osm); }
    static void OlparkReady() { }
    static void OlparkLabels(string lines) { }
#endif

    [Serializable] class Layer { public string name; public float r, g, b; public float[] v; public int[] t; }
    [Serializable] class Lot { public string osm; public string name; public float x, z, area; public float[] v; public int[] t; public float[] outline; public float minX, maxX, minZ, maxZ; }
    [Serializable] class Venue { public string name; public float x, z, h; }
    [Serializable] class Dome { public float x, z, r, h; }
    [Serializable] class ParkData { public Layer[] layers; public Lot[] lots; public Venue[] venues; public Dome dome; }

    [Serializable] class LotState { public string osm; public string name; public int remaining; public int total; public string level; public float x, z; }
    [Serializable] class Station { public string name; public string kind; public float x, z; } // kind: "bus" 면 버스 정류장, 아니면 지하철역
    [Serializable] class ParkingMsg { public LotState[] lots; public string venue; public string best; public Station[] stations; }

    class LotView
    {
        public Lot data;
        public Renderer surface;
        public MeshFilter cars;
        public List<Vector2> slots = new List<Vector2>();
        public List<Vector2> poly;
        public LotState state;
    }

    static readonly Color ColFree = new Color(0.18f, 0.62f, 0.42f);
    static readonly Color ColBusy = new Color(0.89f, 0.66f, 0.23f);
    static readonly Color ColFull = new Color(0.85f, 0.33f, 0.31f);
    static readonly Color ColNone = new Color(0.56f, 0.60f, 0.67f);
    static readonly Color ColAccent = new Color(0.04f, 0.48f, 0.33f);

    Material baseMat;
    Camera cam;
    ParkData park;
    readonly Dictionary<string, LotView> lots = new Dictionary<string, LotView>();
    // 지도에 윤곽이 없는 주차구역: 웹이 알려준 위치에 이름표만 띄운다
    readonly Dictionary<string, LotState> pins = new Dictionary<string, LotState>();
    // 지하철역: 웹이 알려준 위치에 파란 기둥과 이름표를 세운다
    Station[] stations = new Station[0];
    MeshFilter stationMesh, busMesh;
    string stationKey = "";

    // 선택된 공연장 표시
    Venue selected;
    string bestOsm;
    Transform marker;
    MeshFilter route;

    // 카메라
    Vector3 target = new Vector3(430f, 0f, -120f);
    float yaw = -32f, pitch = 38f, dist = 880f;
    bool autoRotate = true;
    Vector3 lastMouse;
    float dragMoved;
    float lastPinch;

    readonly StringBuilder sb = new StringBuilder(1024);

    void Awake()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        WebGLInput.captureAllKeyboardInput = false;
#endif
        Application.targetFrameRate = 60;
        baseMat = Resources.Load<Material>("Base");
        park = JsonUtility.FromJson<ParkData>(Resources.Load<TextAsset>("park").text);

        BuildEnvironment();
        foreach (var l in park.layers) BuildLayer(l);
        if (park.dome != null && park.dome.r > 0f) BuildDome(park.dome);
        foreach (var l in park.lots) BuildLot(l);
        BuildMarker();
        ApplyCamera();
    }

    void Start() { OlparkReady(); }

    // ---------- 만들기 ----------
    Material Mat(Color c, float gloss = 0.05f)
    {
        var m = new Material(baseMat) { color = c };
        m.SetFloat("_Glossiness", gloss);
        return m;
    }

    void BuildEnvironment()
    {
        var camGo = new GameObject("Main Camera") { tag = "MainCamera" };
        cam = camGo.AddComponent<Camera>();
        cam.clearFlags = CameraClearFlags.SolidColor;
        cam.backgroundColor = new Color(0.84f, 0.92f, 0.97f);
        cam.nearClipPlane = 5f;
        cam.farClipPlane = 9000f;
        cam.fieldOfView = 36f;

        var sun = new GameObject("Sun").AddComponent<Light>();
        sun.type = LightType.Directional;
        sun.color = new Color(1f, 0.97f, 0.92f);
        sun.intensity = 0.85f;
        sun.transform.rotation = Quaternion.Euler(50f, -38f, 0f);
        sun.shadows = LightShadows.Hard;
        sun.shadowStrength = 0.38f;
        QualitySettings.shadows = ShadowQuality.HardOnly;
        QualitySettings.shadowResolution = ShadowResolution.VeryHigh;
        QualitySettings.shadowDistance = 2200f;
        QualitySettings.shadowCascades = 2;
        QualitySettings.antiAliasing = 4;

        RenderSettings.ambientMode = AmbientMode.Flat;
        RenderSettings.ambientLight = new Color(0.47f, 0.49f, 0.52f);

        var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
        ground.name = "Ground";
        Destroy(ground.GetComponent<MeshCollider>());
        ground.transform.localScale = new Vector3(600f, 1f, 600f);
        ground.transform.position = new Vector3(0f, -0.4f, 0f); // 겹쳐 깜빡이지 않도록 바닥을 살짝 내림
        ground.GetComponent<Renderer>().sharedMaterial = Mat(new Color(0.9f, 0.905f, 0.91f));
    }

    static Mesh MakeMesh(float[] v, int[] t)
    {
        var verts = new Vector3[v.Length / 3];
        for (int i = 0; i < verts.Length; i++) verts[i] = new Vector3(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
        var mesh = new Mesh { indexFormat = IndexFormat.UInt32, vertices = verts, triangles = t };
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        return mesh;
    }

    void BuildLayer(Layer l)
    {
        var go = new GameObject("Layer_" + l.name);
        go.transform.SetParent(transform, false);
        go.AddComponent<MeshFilter>().sharedMesh = MakeMesh(l.v, l.t);
        var r = go.AddComponent<MeshRenderer>();
        r.sharedMaterial = Mat(new Color(l.r, l.g, l.b), l.name == "water" ? 0.55f : 0.05f);
        bool tall = l.name == "city" || l.name == "parkBuildings" || l.name == "venues" || l.name == "trees";
        r.shadowCastingMode = tall ? ShadowCastingMode.On : ShadowCastingMode.Off;
    }

    void BuildDome(Dome d)
    {
        var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        go.name = "DomeRoof";
        Destroy(go.GetComponent<SphereCollider>());
        go.transform.SetParent(transform, false);
        go.transform.position = new Vector3(d.x, d.h - 1f, d.z);
        go.transform.localScale = new Vector3(d.r * 1.96f, 30f, d.r * 1.96f);
        go.GetComponent<Renderer>().sharedMaterial = Mat(new Color(0.93f, 0.95f, 0.97f), 0.35f);
    }

    void BuildLot(Lot l)
    {
        var view = new LotView { data = l };
        var go = new GameObject("Lot_" + l.osm);
        go.transform.SetParent(transform, false);
        var mesh = MakeMesh(l.v, l.t);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        view.surface = go.AddComponent<MeshRenderer>();
        view.surface.sharedMaterial = Mat(ColNone);
        view.surface.shadowCastingMode = ShadowCastingMode.Off;

        // 주차 칸 후보 위치: 윤곽 안쪽 격자
        var poly = new List<Vector2>();
        for (int i = 0; i + 1 < l.outline.Length; i += 2) poly.Add(new Vector2(l.outline[i], l.outline[i + 1]));
        view.poly = poly;
        int row = 0;
        for (float z = l.minZ + 4f; z < l.maxZ - 3f; z += 6.5f, row++)
        {
            if (row % 3 == 2) continue; // 통로
            for (float x = l.minX + 3f; x < l.maxX - 2f; x += 3.4f)
                if (Inside(poly, x, z) && Inside(poly, x + 1.2f, z + 2.4f) && Inside(poly, x - 1.2f, z - 2.4f)) view.slots.Add(new Vector2(x, z));
        }

        var carsGo = new GameObject("Cars");
        carsGo.transform.SetParent(go.transform, false);
        view.cars = carsGo.AddComponent<MeshFilter>();
        carsGo.AddComponent<MeshRenderer>().sharedMaterial = Mat(new Color(0.3f, 0.34f, 0.4f), 0.4f);
        lots[l.osm] = view;
    }

    void BuildMarker()
    {
        // 선택한 공연장 위에 떠 있는 표식 (팔면체)
        var v = new[] { new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0, 0, -1), new Vector3(0, -1.6f, 0) };
        var faces = new[] { 0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 1, 4, 5, 1, 2, 5, 2, 3, 5, 3, 4, 5, 4, 1 };
        var verts = new List<Vector3>(); var tris = new List<int>();
        for (int i = 0; i < faces.Length; i++) { verts.Add(v[faces[i]]); tris.Add(i); }
        var mesh = new Mesh(); mesh.SetVertices(verts); mesh.SetTriangles(tris, 0); mesh.RecalculateNormals();
        var go = new GameObject("VenueMarker");
        go.transform.SetParent(transform, false);
        go.AddComponent<MeshFilter>().sharedMesh = mesh;
        go.AddComponent<MeshRenderer>().sharedMaterial = Mat(ColAccent, 0.5f);
        go.transform.localScale = new Vector3(9f, 9f, 9f);
        go.SetActive(false);
        marker = go.transform;

        var routeGo = new GameObject("Route");
        routeGo.transform.SetParent(transform, false);
        route = routeGo.AddComponent<MeshFilter>();
        var rr = routeGo.AddComponent<MeshRenderer>();
        rr.sharedMaterial = Mat(ColAccent);
        rr.shadowCastingMode = ShadowCastingMode.Off;
    }

    static bool Inside(List<Vector2> p, float x, float z)
    {
        bool c = false;
        for (int i = 0, j = p.Count - 1; i < p.Count; j = i++)
            if ((p[i].y > z) != (p[j].y > z) && x < (p[j].x - p[i].x) * (z - p[i].y) / (p[j].y - p[i].y) + p[i].x) c = !c;
        return c;
    }

    // ---------- 웹에서 받는 주차 현황 ----------
    public void SetParking(string json)
    {
        ParkingMsg msg;
        try { msg = JsonUtility.FromJson<ParkingMsg>(json); } catch (Exception) { return; }
        if (msg == null || msg.lots == null) return;
        foreach (var s in msg.lots)
        {
            LotView view;
            if (s == null || s.osm == null) continue;
            if (!lots.TryGetValue(s.osm, out view)) { pins[s.osm] = s; continue; }
            view.state = s;
            view.surface.sharedMaterial.color = LevelColor(s.level);
            float ratio = s.total > 0 ? Mathf.Clamp01(1f - (float)s.remaining / s.total) : 0f;
            RebuildCars(view, Mathf.RoundToInt(view.slots.Count * ratio));
        }

        Venue v = null;
        if (!string.IsNullOrEmpty(msg.venue)) foreach (var x in park.venues) if (x.name == msg.venue) v = x;
        if (msg.stations != null) SetStations(msg.stations);
        if (v != selected || msg.best != bestOsm)
        {
            selected = v; bestOsm = msg.best;
            marker.gameObject.SetActive(selected != null);
            RebuildRoute();
        }
    }

    static Color LevelColor(string level) { return level == "full" ? ColFull : level == "busy" ? ColBusy : ColFree; }

    void SetStations(Station[] list)
    {
        var key = "";
        foreach (var s in list) key += s.kind + s.name + "@" + s.x + "," + s.z + ";";
        if (key == stationKey) return; // 바뀐 게 없으면 다시 만들지 않는다
        stationKey = key;
        stations = list;
        if (stationMesh == null)
        {
            stationMesh = NewMarkerMesh("Stations", new Color(0.12f, 0.37f, 0.75f));
            busMesh = NewMarkerMesh("BusStops", new Color(0.05f, 0.58f, 0.62f));
        }
        var verts = new List<Vector3>();
        var tris = new List<int>();
        var busVerts = new List<Vector3>();
        var busTris = new List<int>();
        foreach (var s in list)
        {
            if (s.kind == "bus")
            {
                // 버스 정류장: 역보다 작은 표지판 모양
                AddBox(busVerts, busTris, new Vector3(s.x, 0.4f, s.z), new Vector3(12f, 1f, 12f));
                AddBox(busVerts, busTris, new Vector3(s.x, 0.4f, s.z), new Vector3(3.5f, 12f, 3.5f));
                AddBox(busVerts, busTris, new Vector3(s.x, 12f, s.z), new Vector3(9f, 6f, 9f));
                continue;
            }
            AddBox(verts, tris, new Vector3(s.x, 0.4f, s.z), new Vector3(26f, 1.2f, 26f)); // 바닥판
            AddBox(verts, tris, new Vector3(s.x, 0.4f, s.z), new Vector3(7f, 22f, 7f));    // 기둥
            AddBox(verts, tris, new Vector3(s.x, 22f, s.z), new Vector3(15f, 9f, 15f));    // 머리
        }
        SetMarkerMesh(stationMesh, verts, tris);
        SetMarkerMesh(busMesh, busVerts, busTris);
    }

    MeshFilter NewMarkerMesh(string name, Color color)
    {
        var go = new GameObject(name);
        go.transform.SetParent(transform, false);
        var mf = go.AddComponent<MeshFilter>();
        go.AddComponent<MeshRenderer>().sharedMaterial = Mat(color, 0.3f);
        return mf;
    }

    static void SetMarkerMesh(MeshFilter mf, List<Vector3> verts, List<int> tris)
    {
        var mesh = new Mesh();
        mesh.SetVertices(verts);
        mesh.SetTriangles(tris, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        if (mf.sharedMesh != null) Destroy(mf.sharedMesh);
        mf.sharedMesh = mesh;
    }

    void RebuildRoute()
    {
        var verts = new List<Vector3>(); var tris = new List<int>();
        LotView best; LotState bestPin;
        Vector3 from = Vector3.zero; bool hasFrom = false;
        if (!string.IsNullOrEmpty(bestOsm))
        {
            if (lots.TryGetValue(bestOsm, out best)) { from = new Vector3(best.data.x, 1.2f, best.data.z); hasFrom = true; }
            else if (pins.TryGetValue(bestOsm, out bestPin)) { from = new Vector3(bestPin.x, 1.2f, bestPin.z); hasFrom = true; }
        }
        if (selected != null && hasFrom)
        {
            // 추천 주차장 -> 공연장 방향 안내 점선 (직선)
            var a = from; var b = new Vector3(selected.x, 1.2f, selected.z);
            float len = Vector3.Distance(a, b); var dir = (b - a).normalized; var side = Vector3.Cross(Vector3.up, dir) * 2.2f;
            for (float s = 0f; s < len; s += 16f)
            {
                var p = a + dir * s; var q = a + dir * Mathf.Min(len, s + 9f); int k = verts.Count;
                verts.Add(p - side); verts.Add(p + side); verts.Add(q + side); verts.Add(q - side);
                tris.Add(k); tris.Add(k + 1); tris.Add(k + 2); tris.Add(k); tris.Add(k + 2); tris.Add(k + 3);
                tris.Add(k); tris.Add(k + 2); tris.Add(k + 1); tris.Add(k); tris.Add(k + 3); tris.Add(k + 2);
            }
        }
        var mesh = new Mesh();
        mesh.SetVertices(verts); mesh.SetTriangles(tris, 0);
        var normals = new List<Vector3>(); for (int i = 0; i < verts.Count; i++) normals.Add(Vector3.up);
        mesh.SetNormals(normals); mesh.RecalculateBounds();
        if (route.sharedMesh != null) Destroy(route.sharedMesh);
        route.sharedMesh = mesh;
    }

    void RebuildCars(LotView view, int count)
    {
        var verts = new List<Vector3>();
        var tris = new List<int>();
        // 칸을 고르게 채우기 위해 일정 간격으로 건너뛰며 선택
        int n = view.slots.Count;
        for (int i = 0; i < count && n > 0; i++)
        {
            var s = view.slots[(int)((long)i * 7919 % n)];
            AddBox(verts, tris, new Vector3(s.x, 0.4f, s.y), new Vector3(1.9f, 1.5f, 4.4f));
        }
        var mesh = new Mesh { indexFormat = IndexFormat.UInt32 };
        mesh.SetVertices(verts);
        mesh.SetTriangles(tris, 0);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();
        if (view.cars.sharedMesh != null) Destroy(view.cars.sharedMesh);
        view.cars.sharedMesh = mesh;
    }

    static readonly Vector3[] BoxCorner = {
        new Vector3(-.5f, 0, -.5f), new Vector3(.5f, 0, -.5f), new Vector3(.5f, 0, .5f), new Vector3(-.5f, 0, .5f),
        new Vector3(-.5f, 1, -.5f), new Vector3(.5f, 1, -.5f), new Vector3(.5f, 1, .5f), new Vector3(-.5f, 1, .5f) };
    static readonly int[] BoxFace = { 4, 7, 6, 5, 0, 4, 5, 1, 1, 5, 6, 2, 2, 6, 7, 3, 3, 7, 4, 0 }; // 윗면 + 옆면 4개

    static void AddBox(List<Vector3> verts, List<int> tris, Vector3 basePos, Vector3 size)
    {
        for (int f = 0; f < BoxFace.Length; f += 4)
        {
            int b = verts.Count;
            for (int k = 0; k < 4; k++) verts.Add(basePos + Vector3.Scale(BoxCorner[BoxFace[f + k]], size));
            tris.Add(b); tris.Add(b + 1); tris.Add(b + 2); tris.Add(b); tris.Add(b + 2); tris.Add(b + 3);
        }
    }

    // ---------- 카메라 조작 ----------
    void Update()
    {
        if (Input.touchCount > 0) HandleTouch(); else HandleMouse();
        if (autoRotate) yaw += Time.deltaTime * 2f;
        pitch = Mathf.Clamp(pitch, 14f, 86f);
        dist = Mathf.Clamp(dist, 160f, 3200f);
        target.x = Mathf.Clamp(target.x, -1300f, 1300f);
        target.z = Mathf.Clamp(target.z, -1100f, 1100f);
        ApplyCamera();

        if (selected != null)
        {
            float top = selected.h + (selected.name == "KSPO DOME" ? 30f : 16f);
            marker.position = new Vector3(selected.x, top + Mathf.Sin(Time.time * 2.4f) * 3f, selected.z);
            marker.rotation = Quaternion.Euler(0f, Time.time * 70f, 0f);
        }
        SendLabels();
    }

    void ApplyCamera()
    {
        var rot = Quaternion.Euler(pitch, yaw, 0f);
        cam.transform.SetPositionAndRotation(target + rot * new Vector3(0f, 0f, -dist), rot);
    }

    void Pan(Vector2 d)
    {
        float k = dist / Screen.height * 0.9f;
        var right = Quaternion.Euler(0f, yaw, 0f) * Vector3.right;
        var fwd = Quaternion.Euler(0f, yaw, 0f) * Vector3.forward;
        target -= (right * d.x + fwd * d.y) * k;
    }

    void HandleMouse()
    {
        if (Input.GetMouseButtonDown(0) || Input.GetMouseButtonDown(1)) { lastMouse = Input.mousePosition; dragMoved = 0f; }
        Vector2 d = Input.mousePosition - lastMouse;
        if (Input.GetMouseButton(0) && !Input.GetMouseButtonDown(0))
        {
            if (d.sqrMagnitude > 0f) { yaw += d.x * 0.25f; pitch -= d.y * 0.2f; dragMoved += d.magnitude; if (dragMoved > 4f) autoRotate = false; }
        }
        else if (Input.GetMouseButton(1) && !Input.GetMouseButtonDown(1))
        {
            Pan(d); dragMoved += d.magnitude; autoRotate = false;
        }
        lastMouse = Input.mousePosition;
        if (Input.GetMouseButtonUp(0) && dragMoved < 5f) Click(Input.mousePosition);

        float wheel = Input.mouseScrollDelta.y;
        if (Mathf.Abs(wheel) > 0.001f) { dist *= Mathf.Pow(0.88f, Mathf.Clamp(wheel, -3f, 3f)); autoRotate = false; }
    }

    void HandleTouch()
    {
        if (Input.touchCount == 1)
        {
            var t = Input.GetTouch(0);
            if (t.phase == TouchPhase.Began) dragMoved = 0f;
            if (t.phase == TouchPhase.Moved) { yaw += t.deltaPosition.x * 0.25f; pitch -= t.deltaPosition.y * 0.2f; dragMoved += t.deltaPosition.magnitude; if (dragMoved > 8f) autoRotate = false; }
            if (t.phase == TouchPhase.Ended && dragMoved < 10f) Click(t.position);
            lastPinch = 0f;
        }
        else
        {
            var a = Input.GetTouch(0); var b = Input.GetTouch(1);
            float d = Vector2.Distance(a.position, b.position);
            if (lastPinch > 0f && d > 0f) dist *= lastPinch / d;
            lastPinch = d;
            Pan((a.deltaPosition + b.deltaPosition) * 0.5f);
            autoRotate = false; dragMoved = 99f;
        }
    }

    void Click(Vector3 screen)
    {
        // 물리 엔진 없이 판정: 클릭 광선이 지면과 만나는 점이 어느 주차장 윤곽 안인지 계산
        Ray ray = cam.ScreenPointToRay(screen);
        if (ray.direction.y > -0.0001f) return;
        Vector3 p = ray.origin + ray.direction * ((0.4f - ray.origin.y) / ray.direction.y);
        foreach (var kv in lots)
        {
            var view = kv.Value;
            if (view.state == null || !Inside(view.poly, p.x, p.z)) continue;
            OlparkLotClicked(view.data.osm);
            return;
        }
    }

    // ---------- 이름표: 화면 좌표를 웹으로 전달 ----------
    // 한 줄에 "종류\t글자\tx\ty" (x, y는 화면 비율 0~1, y는 위에서부터). 앞에 있는 줄일수록 겹칠 때 우선 표시된다.
    void SendLabels()
    {
        sb.Length = 0;
        if (selected != null) Emit("sel", selected.name, new Vector3(selected.x, selected.h + (selected.name == "KSPO DOME" ? 52f : 36f), selected.z));
        foreach (var kv in lots)
        {
            var s = kv.Value.state;
            if (s == null) continue;
            Emit(s.level == "full" ? "full" : s.level == "busy" ? "busy" : "free", s.name + " · " + s.remaining + "면", new Vector3(kv.Value.data.x, 12f, kv.Value.data.z));
        }
        foreach (var kv in pins)
        {
            var s = kv.Value;
            Emit(s.level == "full" ? "full" : s.level == "busy" ? "busy" : "free", s.name + " · " + s.remaining + "면", new Vector3(s.x, 12f, s.z));
        }
        foreach (var s in stations) if (s.kind != "bus") Emit("station", s.name, new Vector3(s.x, 36f, s.z));
        foreach (var v in park.venues)
            if (v != selected) Emit("venue", v.name, new Vector3(v.x, v.h + (v.name == "KSPO DOME" ? 26f : 10f), v.z));
        // 버스 정류장은 수가 많아 맨 뒤에 둔다 (다른 이름표와 겹치면 숨겨진다)
        foreach (var s in stations) if (s.kind == "bus") Emit("bus", s.name, new Vector3(s.x, 22f, s.z));
        OlparkLabels(sb.ToString());
    }

    void Emit(string kind, string text, Vector3 world)
    {
        Vector3 p = cam.WorldToViewportPoint(world);
        if (p.z < 0f || p.x < -0.05f || p.x > 1.05f || p.y < -0.05f || p.y > 1.05f) return;
        sb.Append(kind).Append('\t').Append(text).Append('\t')
          .Append(p.x.ToString("F4", CultureInfo.InvariantCulture)).Append('\t')
          .Append((1f - p.y).ToString("F4", CultureInfo.InvariantCulture)).Append('\n');
    }
}
