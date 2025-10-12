import UIKit
import Capacitor

final class RootViewController: UIViewController {
    private let bridgeViewController: CAPBridgeViewController
    private let tabBar = UITabBar()

    private let tabs: [(title: String, path: String, icon: String)] = [
        ("Home", "/", "house"),
        ("Schedule", "/schedule", "calendar"),
        ("Track", "/track", "plus.circle"),
        ("Progress", "/progress", "chart.bar"),
        ("Profile", "/profile", "person")
    ]

    init(bridgeViewController: CAPBridgeViewController) {
        self.bridgeViewController = bridgeViewController
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .black

        addChild(bridgeViewController)
        view.addSubview(bridgeViewController.view)
        bridgeViewController.didMove(toParent: self)

        tabBar.items = tabs.enumerated().map { index, tab in
            UITabBarItem(title: tab.title, image: UIImage(systemName: tab.icon), tag: index)
        }
        tabBar.selectedItem = tabBar.items?.first
        tabBar.delegate = self

        if #available(iOS 13.0, *) {
            let appearance = UITabBarAppearance()
            appearance.configureWithDefaultBackground()
            appearance.backgroundEffect = UIBlurEffect(style: .systemChromeMaterialDark)
            appearance.backgroundColor = UIColor.black.withAlphaComponent(0.65)
            appearance.stackedLayoutAppearance.normal.iconColor = .lightGray
            appearance.stackedLayoutAppearance.normal.titleTextAttributes = [
                .foregroundColor: UIColor.lightGray
            ]
            appearance.stackedLayoutAppearance.selected.iconColor = UIColor.systemGreen
            appearance.stackedLayoutAppearance.selected.titleTextAttributes = [
                .foregroundColor: UIColor.systemGreen
            ]
            tabBar.standardAppearance = appearance
            if #available(iOS 15.0, *) {
                tabBar.scrollEdgeAppearance = appearance
            }
        }

        tabBar.clipsToBounds = true

        view.addSubview(tabBar)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()

        let safe = view.safeAreaInsets
        let tabHeight: CGFloat = 60 + safe.bottom

        tabBar.frame = CGRect(
            x: 0,
            y: view.bounds.height - tabHeight,
            width: view.bounds.width,
            height: tabHeight
        )

        bridgeViewController.view.frame = CGRect(
            x: 0,
            y: 0,
            width: view.bounds.width,
            height: view.bounds.height - tabHeight + safe.bottom
        )
        bridgeViewController.view.insetsLayoutMarginsFromSafeArea = false
    }
}

extension RootViewController: UITabBarDelegate {
    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard let index = tabBar.items?.firstIndex(of: item) else { return }
        let targetPath = tabs[index].path

        bridgeViewController.bridge?.webView?.evaluateJavaScript("""
            window.dispatchEvent(new CustomEvent("nativeTabChange", { detail: { pathname: "\(targetPath)" } }));
        """, completionHandler: nil)
    }
}
