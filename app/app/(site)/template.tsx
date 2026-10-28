/** FomoEven's page entry (decor `.page-enter`): every route rises 18 px and fades in over 560 ms, cut under reduced motion. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
