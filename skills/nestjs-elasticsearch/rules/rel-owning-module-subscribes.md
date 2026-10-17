---
title: The Owning Module Subscribes; Others Emit Their Own Events
impact: MEDIUM-HIGH
impactDescription: "index ownership stays one-directional; no cross-module coupling"
tags: cross-entity, events, ownership, decoupling
---

## The Owning Module Subscribes; Others Emit Their Own Events

**Impact: MEDIUM-HIGH** — index ownership stays one-directional; no cross-module coupling

When one entity changes a derived value on another — a comment changes a post's comment count, a
track changes a post's view count — the module that **owns the index** subscribes to the change. The
contributing module emits an event about **its own** aggregate and learns nothing about the other
module's index. Never make the contributing module emit an event named after another module's
concern.

**Incorrect (the contributing module knows about the other module's index):**

```typescript
// modules/comments/comments.service.ts — comments must not know about the posts index
async addComment(input: AddCommentInput): Promise<Comment> {
  const comment = await this.commentsRepository.create(input);
  this.events.emit('post.stats-changed', { postId: input.postId }); // invents a post concern
  return comment;
}
```

Why it is wrong: the comments module couples to the posts module's derived concern and to the
existence of a posts index, so the boundary is inverted and the two features become entangled.

**Correct (the contributor emits its own fact; the owner subscribes):**

```typescript
// modules/comments/comments.service.ts — emits a comment fact, nothing about posts
async addComment(input: AddCommentInput): Promise<Comment> {
  const comment = await this.commentsRepository.create(input);
  this.events.emit('comment.created', { commentId: comment._id.toString(), postId: input.postId });
  return comment;
}

// modules/posts/search/posts.search-indexer.ts — the post index owner subscribes
@OnEvent('comment.created')
@OnEvent('comment.deleted')
async onCommentChanged(e: { postId: string }): Promise<void> {
  await this.posts.recomputeStats(e.postId);     // update the post's own derived value
  await this.postsSearch.enqueueIndex(e.postId); // reindex the post
}
```

Why it is right: comments emits a fact about comments and stays fully independent; only the module
that owns the post index decides that a comment affects a post.

Dependency direction: **Posts knows comments exist; comments knows nothing.** This is the same
owning-module principle as `relations-owning-module` in `nestjs-graphql-structure`, applied to the
index. Owned derived values are cached on the owning document so recomputation on an event is cheap
— see `rel-derived-counter-cache`.

Reference: [NestJS Events](https://docs.nestjs.com/techniques/events) | [nestjs-best-practices — arch-use-events](https://docs.nestjs.com/techniques/events)
