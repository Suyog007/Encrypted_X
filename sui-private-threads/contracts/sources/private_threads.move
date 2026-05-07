module private_threads::private_threads;

use sui::event;
use std::string::{Self, String};

/// User profile object containing public information
public struct UserProfile has key, store {
    id: UID,
    owner: address,
    username: String,
    bio: String,
    created_at: u64,
    follower_count: u64,
    following_count: u64,
}

/// Encrypted post metadata stored on-chain
public struct EncryptedPost has key, store {
    id: UID,
    author: address,
    walrus_blob_id: String,
    seal_id: vector<u8>,          // Random 32-byte SEAL namespace identifier
    seal_encrypted_key: vector<u8>, // SEAL threshold-encrypted symmetric key
    content_type: String,          // "text", "image", "video"
    created_at: u64,
    is_token_gated: bool,
    token_type: Option<String>,
}

/// Follower list for a user (owned by user)
public struct FollowerList has key {
    id: UID,
    owner: address,
    followers: vector<address>,
}

/// Access key reference for additional per-user SEAL decryption
public struct AccessKey has key, store {
    id: UID,
    owner: address,
    post_id: ID,
    encrypted_key: vector<u8>,
}

// ── Events ──────────────────────────────────────────────────────────────────

public struct ProfileCreated has copy, drop {
    profile_id: ID,
    owner: address,
    username: String,
}

public struct PostCreated has copy, drop {
    post_id: ID,
    author: address,
    walrus_blob_id: String,
    content_type: String,
    created_at: u64,
}

public struct FollowerListCreated has copy, drop {
    list_id: ID,
    owner: address,
}

public struct FollowEvent has copy, drop {
    follower: address,
    following: address,
}

public struct UnfollowEvent has copy, drop {
    follower: address,
    unfollowing: address,
}

// ── Error codes ──────────────────────────────────────────────────────────────

const E_NOT_AUTHORIZED: u64 = 2;
const E_NOT_FOLLOWING: u64 = 4;
const E_ALREADY_FOLLOWING: u64 = 5;
const E_INVALID_SEAL_ID: u64 = 7;

// ── Entry functions ──────────────────────────────────────────────────────────

/// Create a new user profile (shared object, publicly visible)
public entry fun create_profile(
    username: vector<u8>,
    bio: vector<u8>,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();

    let profile = UserProfile {
        id: object::new(ctx),
        owner: sender,
        username: string::utf8(username),
        bio: string::utf8(bio),
        created_at: ctx.epoch_timestamp_ms(),
        follower_count: 0,
        following_count: 0,
    };

    let profile_id = object::id(&profile);
    transfer::share_object(profile);

    event::emit(ProfileCreated {
        profile_id,
        owner: sender,
        username: string::utf8(username),
    });
}

/// Create an encrypted post on-chain.
/// walrus_blob_id  - Walrus blob containing IV-prepended AES-GCM ciphertext
/// seal_id         - 32 random bytes used as the SEAL encryption namespace
/// seal_encrypted_key - SEAL threshold-encrypted AES-256-GCM symmetric key
public entry fun create_post(
    walrus_blob_id: vector<u8>,
    seal_id: vector<u8>,
    seal_encrypted_key: vector<u8>,
    content_type: vector<u8>,
    is_token_gated: bool,
    token_type: vector<u8>,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();

    let post = EncryptedPost {
        id: object::new(ctx),
        author: sender,
        walrus_blob_id: string::utf8(walrus_blob_id),
        seal_id,
        seal_encrypted_key,
        content_type: string::utf8(content_type),
        created_at: ctx.epoch_timestamp_ms(),
        is_token_gated,
        token_type: if (token_type.length() == 0) {
            option::none()
        } else {
            option::some(string::utf8(token_type))
        },
    };

    let post_id = object::id(&post);
    transfer::share_object(post);

    event::emit(PostCreated {
        post_id,
        author: sender,
        walrus_blob_id: string::utf8(walrus_blob_id),
        content_type: string::utf8(content_type),
        created_at: ctx.epoch_timestamp_ms(),
    });
}

/// Initialise a follower list for the caller (owned object).
public entry fun init_follower_list(ctx: &mut TxContext) {
    let sender = ctx.sender();

    let follower_list = FollowerList {
        id: object::new(ctx),
        owner: sender,
        followers: vector[],
    };

    let list_id = object::id(&follower_list);
    transfer::transfer(follower_list, sender);

    event::emit(FollowerListCreated {
        list_id,
        owner: sender,
    });
}

/// Follow the owner of the given FollowerList.
public entry fun follow(
    follower_list: &mut FollowerList,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();
    let following = follower_list.owner;

    assert!(sender != following, E_NOT_AUTHORIZED);

    let len = follower_list.followers.length();
    let mut i = 0;
    let mut already_following = false;
    while (i < len) {
        if (follower_list.followers[i] == sender) {
            already_following = true;
            break
        };
        i = i + 1;
    };

    assert!(!already_following, E_ALREADY_FOLLOWING);

    follower_list.followers.push_back(sender);

    event::emit(FollowEvent { follower: sender, following });
}

/// Unfollow the owner of the given FollowerList.
public entry fun unfollow(
    follower_list: &mut FollowerList,
    ctx: &mut TxContext
) {
    let sender = ctx.sender();
    let unfollowing = follower_list.owner;

    assert!(sender != unfollowing, E_NOT_AUTHORIZED);

    let len = follower_list.followers.length();
    let mut i = 0;
    let mut found = false;
    while (i < len) {
        if (follower_list.followers[i] == sender) {
            found = true;
            break
        };
        i = i + 1;
    };

    assert!(found, E_NOT_FOLLOWING);

    follower_list.followers.remove(i);

    event::emit(UnfollowEvent { follower: sender, unfollowing });
}

// ── SEAL access-control functions ────────────────────────────────────────────
//
// SEAL key servers call these functions via a dry-run transaction to verify
// that the requesting address is authorised to receive key shares.

/// Approve SEAL decryption for the post author.
public entry fun seal_approve(
    id: vector<u8>,
    post: &EncryptedPost,
    ctx: &TxContext
) {
    assert!(post.seal_id == id, E_INVALID_SEAL_ID);
    assert!(post.author == ctx.sender(), E_NOT_AUTHORIZED);
}

/// Approve SEAL decryption for a follower of the post author.
public entry fun seal_approve_follower(
    id: vector<u8>,
    post: &EncryptedPost,
    follower_list: &FollowerList,
    ctx: &TxContext
) {
    assert!(post.seal_id == id, E_INVALID_SEAL_ID);
    let caller = ctx.sender();
    // The follower list must belong to the post author
    assert!(follower_list.owner == post.author, E_NOT_AUTHORIZED);
    assert!(is_following(follower_list, caller), E_NOT_FOLLOWING);
}

// ── Read-only helpers ────────────────────────────────────────────────────────

public fun is_following(follower_list: &FollowerList, addr: address): bool {
    let len = follower_list.followers.length();
    let mut i = 0;
    while (i < len) {
        if (follower_list.followers[i] == addr) {
            return true
        };
        i = i + 1;
    };
    false
}

public fun get_post_author(post: &EncryptedPost): address         { post.author }
public fun get_post_walrus_blob_id(post: &EncryptedPost): String  { post.walrus_blob_id }
public fun get_post_seal_id(post: &EncryptedPost): vector<u8>     { post.seal_id }
public fun get_post_seal_key(post: &EncryptedPost): vector<u8>    { post.seal_encrypted_key }
public fun get_post_content_type(post: &EncryptedPost): String    { post.content_type }
public fun get_post_created_at(post: &EncryptedPost): u64         { post.created_at }

public fun get_followers(follower_list: &FollowerList): vector<address> { follower_list.followers }
public fun get_follower_list_owner(follower_list: &FollowerList): address { follower_list.owner }
