import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Link2, MessageCircle, MoreHorizontal } from "lucide-react";
import { Avatar, Badge, Card, PageHeader } from "@uniz/ui";
import { AuthRetryNotice } from "../auth-retry-notice";
import type {
  CommunityAuthor,
  CommunityDirectoryData,
  CommunityPostData,
  CommunityPostSummary,
  CommunityPagination,
  AnnouncementDetail,
  AnnouncementSummary,
  CommunityComment,
} from "../../lib/server/community-repository";
import {
  CommunityCommentForm,
  PostArchiveForm,
  PostModerationForm,
  CommentArchiveForm,
  CommentModerationForm,
  AnnouncementArchiveForm,
  type CommunityReturnFilters,
} from "./forms";
import {
  communityCategoryLabels,
  communityHref,
  communityPostHref,
  communityDate,
  communityParagraphs,
  announcementIsScheduled,
} from "./presentation";
import "./community.css";
import { LikeButton } from "../like-button";
import { ContentBody, VideoReference } from "../content/presentation";

export function CommunityAccessNotice({
  mode,
  retryHref = "/community",
  retryAfterSeconds,
}: {
  mode: "DEMO" | "PENDING" | "ERROR" | "REAUTH" | "LEFT";
  retryHref?: string;
  retryAfterSeconds?: number;
}) {
  if (mode === "ERROR") return <AuthRetryNotice retryAfterSeconds={retryAfterSeconds} />;
  const copy =
    mode === "PENDING"
      ? {
          title: "멤버 승인을 기다려주세요.",
          body: "프로필을 등록하고 운영진의 승인을 받으면 커뮤니티를 이용할 수 있습니다.",
          label: "내 프로필 확인",
          href: "/onboarding",
        }
      : mode === "LEFT"
        ? {
            title: "UNIZ 서버 가입을 확인해주세요.",
            body: "현재 Discord 서버 멤버 상태를 확인할 수 없습니다. 가입 상태를 확인한 뒤 다시 로그인해주세요.",
            label: "가입 상태 확인 후 로그인",
            href: `/login?callbackUrl=${encodeURIComponent(retryHref)}`,
          }
        : {
            title:
              mode === "REAUTH" ? "로그인 연결을 확인해주세요." : "하이브 멤버들의 커뮤니티입니다.",
            body: "승인된 Discord 계정으로 로그인하면 글과 공지를 읽고 경험을 나눌 수 있습니다.",
            label: "로그인",
            href: `/login?callbackUrl=${encodeURIComponent(retryHref)}`,
          };
  return (
    <div className="community-page">
      <PageHeader eyebrow="하이브 커뮤니티" title={copy.title} description={copy.body} />
      <Card className="community-empty">
        <Link className="button button-primary" href={copy.href}>
          {copy.label}
        </Link>
      </Card>
    </div>
  );
}
export function CommunityReadFailure({
  message = "내용을 불러오지 못했습니다. 잠시 후 다시 확인해주세요.",
  returnHref = "/community",
}: {
  message?: string;
  returnHref?: string;
}) {
  return (
    <Card className="community-empty">
      <p role="alert">{message}</p>
      <Link className="community-back" href={returnHref}>
        커뮤니티로 돌아가기
      </Link>
    </Card>
  );
}
export function CommunitySectionLinks({ showcase = false }: { showcase?: boolean }) {
  return (
    <nav className="community-sections" aria-label="커뮤니티 공간">
      <Link href="/community" aria-current={!showcase ? "page" : undefined}>
        게시판
      </Link>
      <Link href="/community/showcase" aria-current={showcase ? "page" : undefined}>
        자랑하기
      </Link>
    </nav>
  );
}
function Author({
  author,
  size = "md",
  children,
}: {
  author: CommunityAuthor;
  size?: "md" | "lg";
  children?: ReactNode;
}) {
  const identity = (
    <>
      {author.id && (
        <span className="community-author-portrait" aria-hidden="true">
          <Avatar name={author.name} imageUrl={author.imageUrl} size={size} />
        </span>
      )}
      <span className="community-author-copy">
        <span className="community-author-name">{author.name}</span>
        {children && <span className="community-author-details">{children}</span>}
      </span>
    </>
  );
  return author.handle ? (
    <Link className="community-author" href={`/members/${encodeURIComponent(author.handle)}`}>
      {identity}
    </Link>
  ) : (
    <span className="community-author">{identity}</span>
  );
}
export function CommunityBody({ text }: { text: string }) {
  return (
    <div className="community-body">
      {communityParagraphs(text).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}
function PostBadges({ post }: { post: CommunityPostSummary }) {
  return (
    <>
      <Badge tone="primary">{communityCategoryLabels[post.category]}</Badge>
      {post.isPinned && <Badge tone="warning">고정</Badge>}
      {post.hiddenAt && <Badge>숨김</Badge>}
      {post.archivedAt && <Badge>보관됨</Badge>}
    </>
  );
}
function PostReactions({ post, commentHref }: { post: CommunityPostSummary; commentHref: string }) {
  return (
    <div className="community-reactions">
      <LikeButton
        kind="COMMUNITY_POST"
        targetId={post.id}
        initialCount={post.likeCount}
        initialLiked={post.likedByMe}
        canLike={post.canLike}
      />
      <Link className="community-comment-link" href={commentHref}>
        <MessageCircle size={16} aria-hidden="true" />
        <span>댓글</span>
        <span>{post.commentCount}</span>
      </Link>
    </div>
  );
}
function CommunityPaginationLinks({
  pagination,
  href,
}: {
  pagination: CommunityPagination;
  href: (page: number) => string;
}) {
  if (pagination.page === 1 && !pagination.hasNextPage) return null;
  return (
    <nav className="community-pagination" aria-label="목록 페이지">
      {pagination.page > 1 && (
        <Link href={href(pagination.page - 1)} prefetch={false}>
          이전 목록
        </Link>
      )}
      <span>{pagination.page}페이지</span>
      {pagination.hasNextPage && (
        <Link href={href(pagination.page + 1)} prefetch={false}>
          다음 목록
        </Link>
      )}
    </nav>
  );
}
export function PostManagement({
  post,
  filters,
}: {
  post: CommunityPostSummary;
  filters?: CommunityReturnFilters;
}) {
  return (
    <div className="community-detail-actions">
      {post.canEdit && (
        <Link
          className="button button-quiet"
          href={`${communityPostHref(post.id, filters).replace(`/community/${post.id}`, `/community/${post.id}/edit`)}`}
        >
          글 수정
        </Link>
      )}
      {post.canArchive && (
        <PostArchiveForm id={post.id} updatedAt={post.updatedAt} filters={filters} />
      )}
      {post.canModerate && !post.archivedAt && (
        <div className="community-inline-actions">
          <PostModerationForm
            id={post.id}
            updatedAt={post.updatedAt}
            action={post.hiddenAt ? "SHOW" : "HIDE"}
            label={post.hiddenAt ? "다시 표시" : "글 숨기기"}
          />
          <PostModerationForm
            id={post.id}
            updatedAt={post.updatedAt}
            action={post.isPinned ? "UNPIN" : "PIN"}
            label={post.isPinned ? "고정 해제" : "상단 고정"}
          />
        </div>
      )}
    </div>
  );
}
export function AnnouncementList({
  announcements,
  admin = false,
  asOf,
}: {
  announcements: AnnouncementSummary[];
  admin?: boolean;
  asOf: string;
}) {
  if (!announcements.length) return null;
  return (
    <Card className="community-notices">
      <h2>하이브 공지</h2>
      {announcements.map((notice) => (
        <Link
          className="community-notice-link"
          href={
            admin ? `/admin/community/notices/${notice.id}/edit` : `/announcements/${notice.id}`
          }
          key={notice.id}
        >
          <span>
            {notice.isPinned && <Badge tone="warning">고정</Badge>}
            {notice.archivedAt && <Badge>보관됨</Badge>}
            {admin && !notice.archivedAt && announcementIsScheduled(notice.publishedAt, asOf) && (
              <Badge tone="warning">발행 예약</Badge>
            )}
            {notice.title}
          </span>
          <time dateTime={notice.publishedAt}>{communityDate(notice.publishedAt)}</time>
        </Link>
      ))}
    </Card>
  );
}
export function CommunityDirectory({
  data,
  admin = false,
}: {
  data: CommunityDirectoryData;
  admin?: boolean;
}) {
  const showcase = data.section === "SHOWCASE" || data.category === "SHOWCASE";
  const filters: CommunityReturnFilters = {
    q: data.q,
    category: data.category,
    page: data.pagination.page,
    ...(showcase ? { section: "SHOWCASE" } : {}),
  };
  return (
    <div className="community-page">
      <PageHeader
        eyebrow={admin ? "하이브 운영" : "하이브 커뮤니티"}
        title={
          admin ? "커뮤니티 관리" : showcase ? "우리의 순간을 자랑하세요" : "경험을 나누는 공간"
        }
        description={
          showcase
            ? "건축, 캐릭터, 장비와 즐거웠던 순간을 사진과 짧은 이야기로 나눠보세요."
            : "공략·팁·질문과 사용한 빌드를 하이브 멤버들과 공유하세요."
        }
        action={
          <div className="community-detail-actions">
            {data.canCreate && (
              <Link className="button button-primary" href={communityPostHref("new", filters)}>
                {showcase ? "자랑 올리기" : "글 쓰기"}
              </Link>
            )}
            {data.canModerate && (
              <Link
                className="button button-quiet"
                href={admin ? "/admin/community/notices/new" : "/admin/community"}
              >
                {admin ? "공지 작성" : "운영진 관리"}
              </Link>
            )}
          </div>
        }
      />
      {!admin && <CommunitySectionLinks showcase={showcase} />}
      {(!showcase || admin) && (
        <AnnouncementList announcements={data.announcements} admin={admin} asOf={data.asOf} />
      )}
      <div className="community-toolbar">
        {(!showcase || admin) && (
          <nav className="community-filters" aria-label="글 분류">
            <Link
              href={communityHref({ q: data.q, admin })}
              aria-current={!data.category ? "page" : undefined}
            >
              전체
            </Link>
            {Object.entries(communityCategoryLabels)
              .filter(([key]) => admin || key !== "SHOWCASE")
              .map(([key, label]) => (
                <Link
                  key={key}
                  href={communityHref({ q: data.q, category: key, admin })}
                  aria-current={key === data.category ? "page" : undefined}
                >
                  {label}
                </Link>
              ))}
          </nav>
        )}
        <form
          className="community-search"
          action={admin ? "/admin/community" : showcase ? "/community/showcase" : "/community"}
          method="get"
        >
          {data.category && (!showcase || admin) && (
            <input name="category" type="hidden" value={data.category} />
          )}
          <input
            type="search"
            name="q"
            aria-label="커뮤니티 글 검색"
            maxLength={120}
            defaultValue={data.q}
            placeholder="제목·내용 검색"
          />
          <button type="submit" className="button button-quiet">
            검색
          </button>
        </form>
      </div>
      <div className="community-section-heading">
        <h2>
          {showcase
            ? "자랑하기"
            : data.category
              ? communityCategoryLabels[data.category]
              : "전체 글"}
        </h2>
        <span>{data.pagination.totalCount}개 · 하이브 멤버 공개</span>
      </div>
      {data.posts.length ? (
        <div className={`community-list${showcase ? " community-gallery" : ""}`}>
          {data.posts.map((post) => (
            <Card
              className={`community-post-card${post.category === "SHOWCASE" ? " community-showcase-card" : ""}`}
              key={post.id}
            >
              <header className="community-article-header community-list-header">
                <Author author={post.author}>
                  <time dateTime={post.createdAt}>{communityDate(post.createdAt)}</time>
                </Author>
                <div className="community-article-labels">
                  <PostBadges post={post} />
                </div>
              </header>
              {post.category === "SHOWCASE" && post.coverImage && (
                <Link
                  className="community-showcase-cover"
                  href={communityPostHref(post.id, filters)}
                  aria-label={`${post.title} 사진과 글 보기`}
                >
                  <Image
                    src={post.coverImage.url}
                    alt={post.coverImage.alt || `${post.title} 대표 사진`}
                    fill
                    sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw"
                    unoptimized
                    loading="lazy"
                  />
                  {(post.imageCount ?? 0) > 1 && (
                    <span className="community-photo-count">사진 {post.imageCount}장</span>
                  )}
                </Link>
              )}
              <div className="community-card-copy">
                <h2>
                  <Link href={communityPostHref(post.id, filters)}>{post.title}</Link>
                </h2>
                {post.excerpt.trim() && <p>{post.excerpt}</p>}
              </div>
              <div className="community-post-footer">
                <PostReactions
                  post={post}
                  commentHref={`${communityPostHref(post.id, filters)}#comments`}
                />
                {post.hasBuildLink && (
                  <span className="community-build-indicator">
                    <Link2 size={14} aria-hidden="true" /> 빌드 연결
                  </span>
                )}
              </div>
              {admin && (
                <div className="community-moderation">
                  <PostManagement post={post} filters={filters} />
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="community-empty">
          {data.q
            ? "검색 조건에 맞는 글이 없습니다."
            : showcase
              ? "아직 자랑 글이 없습니다. 첫 사진과 이야기를 나눠주세요."
              : "아직 등록된 글이 없습니다. 첫 경험을 나눠주세요."}
        </Card>
      )}
      <CommunityPaginationLinks
        pagination={data.pagination}
        href={(page) => communityHref({ ...filters, page, admin })}
      />
    </div>
  );
}

function CommentContent({
  comment,
  postId,
  filters,
}: {
  comment: CommunityComment;
  postId: string;
  filters: CommunityReturnFilters;
}) {
  return (
    <>
      <div className="community-article-header community-list-header community-comment-header">
        <Author author={comment.author}>
          <time dateTime={comment.createdAt}>{communityDate(comment.createdAt)}</time>
        </Author>
        <div className="community-article-labels">
          {comment.hiddenAt && <Badge>숨김</Badge>}
          {comment.archivedAt && <Badge>삭제됨</Badge>}
        </div>
      </div>
      <p className="community-comment-body">
        {comment.isPlaceholder ? "삭제된 댓글입니다." : comment.body}
      </p>
      <div className="community-inline-actions">
        {!comment.isPlaceholder && (
          <LikeButton
            kind="COMMUNITY_COMMENT"
            targetId={comment.id}
            initialCount={comment.likeCount}
            initialLiked={comment.likedByMe}
            canLike={comment.canLike}
          />
        )}
        {comment.canArchive && <CommentArchiveForm comment={comment} />}
        {comment.canModerate && !comment.archivedAt && <CommentModerationForm comment={comment} />}
      </div>
      <div className="community-comment-options">
        {comment.canEdit && (
          <details className="community-comment-controls">
            <summary>{comment.parentId ? "답글 수정" : "댓글 수정"}</summary>
            <CommunityCommentForm postId={postId} comment={comment} filters={filters} />
          </details>
        )}
        {comment.canReply && (
          <details className="community-comment-controls">
            <summary>답글 달기</summary>
            <CommunityCommentForm postId={postId} parentId={comment.id} filters={filters} />
          </details>
        )}
      </div>
    </>
  );
}

export function CommunityPostDetail({
  data,
  filters = {},
}: {
  data: CommunityPostData;
  filters?: CommunityReturnFilters;
}) {
  const post = data.post;
  filters =
    post.category === "SHOWCASE"
      ? { ...filters, category: null, section: "SHOWCASE" }
      : {
          ...filters,
          category: filters.category === "SHOWCASE" ? null : filters.category,
          section: "BOARD",
        };
  const detailHref = communityPostHref(post.id, filters);
  return (
    <div className="community-page community-reader">
      <Link className="community-back" href={communityHref(filters)}>
        {post.category === "SHOWCASE" ? "← 자랑하기 목록" : "← 글 목록"}
      </Link>
      <Card className="community-detail">
        <div className="community-detail-heading">
          <div className="community-detail-labels">
            <div className="community-article-labels">
              <PostBadges post={post} />
            </div>
            <span>하이브 멤버 공개</span>
          </div>
          <h1>{post.title}</h1>
        </div>
        <header className="community-article-header">
          <Author author={post.author} size="lg">
            <time dateTime={post.createdAt}>{communityDate(post.createdAt)}</time>
            {post.createdAt !== post.updatedAt && <span>수정됨</span>}
          </Author>
        </header>
        {post.hiddenAt && (
          <p className="community-note">숨김 상태인 글입니다. 작성자와 운영진에게만 표시됩니다.</p>
        )}
        {post.archivedAt && <p className="community-note">보관된 글입니다.</p>}
        <div className="community-article-content">
          <ContentBody document={post.bodyDocument ?? null} text={post.body} />
          <VideoReference url={post.youtubeUrl ?? null} />
        </div>
        {(data.linkedBuildVersion || data.buildLinkNotice) && (
          <section className="community-linked-build" aria-label="공유한 고정 빌드 버전">
            <h2>이 글의 빌드 버전</h2>
            {data.linkedBuildVersion ? (
              <>
                <Link href={data.linkedBuildVersion.href}>
                  {data.linkedBuildVersion.title} · {data.linkedBuildVersion.version}번 버전
                </Link>
                <p className="community-note">
                  글에 연결한 버전입니다. 이후 저장한 버전으로 자동 변경되지 않습니다.
                </p>
              </>
            ) : (
              <p className="community-note">{data.buildLinkNotice}</p>
            )}
          </section>
        )}
        <div className="community-detail-bottom">
          <PostReactions post={post} commentHref="#comments" />
          {(post.canEdit || post.canArchive || post.canModerate) && (
            <details className="community-management">
              <summary>
                <MoreHorizontal size={18} aria-hidden="true" /> 글 관리
              </summary>
              <div className="community-management-actions">
                <PostManagement post={post} filters={filters} />
              </div>
            </details>
          )}
        </div>
      </Card>
      <section className="community-comments" id="comments" aria-label="댓글">
        <div className="community-section-heading">
          <h2>댓글</h2>
          <span>{post.commentCount}개</span>
        </div>
        {data.canComment && (
          <Card className="community-comment">
            <CommunityCommentForm postId={post.id} filters={filters} />
          </Card>
        )}
        {!data.comments.length && <p className="community-note">아직 댓글이 없습니다.</p>}
        {data.comments.map((comment) => (
          <Card className="community-comment" key={comment.id} id={`comment-${comment.id}`}>
            <CommentContent comment={comment} postId={post.id} filters={filters} />
            {Boolean(comment.replies?.length) && (
              <div className="community-replies">
                {comment.replies!.map((reply) => (
                  <article className="community-reply" id={`comment-${reply.id}`} key={reply.id}>
                    <CommentContent comment={reply} postId={post.id} filters={filters} />
                  </article>
                ))}
              </div>
            )}
            {comment.replyPagination && (
              <CommunityPaginationLinks
                pagination={comment.replyPagination}
                href={(replyPage) =>
                  `${detailHref}${detailHref.includes("?") ? "&" : "?"}commentPage=${data.commentPagination.page}&replyRoot=${comment.id}&replyPage=${replyPage}#comment-${comment.id}`
                }
              />
            )}
          </Card>
        ))}
        <CommunityPaginationLinks
          pagination={data.commentPagination}
          href={(commentPage) =>
            `${detailHref}${detailHref.includes("?") ? "&" : "?"}commentPage=${commentPage}`
          }
        />
      </section>
    </div>
  );
}

export function AnnouncementView({ announcement }: { announcement: AnnouncementDetail }) {
  return (
    <div className="community-page">
      <Link className="community-back" href="/community">
        ← 커뮤니티
      </Link>
      <PageHeader
        eyebrow="하이브 공지"
        title={announcement.title}
        description="하이브 멤버에게 전달하는 운영 공지입니다."
      />
      <Card className="community-detail">
        <header className="community-article-header">
          <Author author={announcement.author} size="lg">
            <time dateTime={announcement.publishedAt}>
              {communityDate(announcement.publishedAt)}
            </time>
          </Author>
          <div className="community-article-labels">
            {announcement.isPinned && <Badge tone="warning">고정 공지</Badge>}
            {announcement.archivedAt && <Badge>보관됨</Badge>}
          </div>
        </header>
        <div className="community-article-content">
          <CommunityBody text={announcement.content} />
        </div>
        {announcement.canManage && !announcement.archivedAt && (
          <div className="community-detail-actions">
            <Link
              className="button button-quiet"
              href={`/admin/community/notices/${announcement.id}/edit`}
            >
              공지 수정
            </Link>
            <AnnouncementArchiveForm announcement={announcement} />
          </div>
        )}
      </Card>
    </div>
  );
}
